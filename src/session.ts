import type {
  HeadTransport,
  Ingredient,
  Recipe,
  ScaleReading,
  SessionOptions,
  SessionSnapshot,
} from "./types";

const DEFAULT_OPTIONS: SessionOptions = { stableTicks: 3, settleLbs: 5 };

/**
 * Tracks a driver loading one recipe into a mixer.
 *
 * The scale is the source of truth. The session never predicts or fudges a
 * weight: the amount loaded for the current ingredient is always derived from
 * the gross reading and the gross that was on the mixer when the ingredient
 * started (the "anchor").
 */
export class LoadingSession {
  private index = 0;
  private anchorGross: number | null = null;
  private lastGross: number | null = null;
  /** Lbs credited to the current ingredient before this process started. */
  // Explanation: dead state after fixing the snapshot restore -> private carriedLbs = 0;
  private loadedLbs = 0;
  private isReady = false;
  private complete = false;
  // Explanation: Added to accrue jitter readings
  private settledTicks = 0;
  private readonly options: SessionOptions;

  constructor(
    private readonly recipe: Recipe,
    private readonly head: HeadTransport,
    options: Partial<SessionOptions> = {},
  ) {
    if (recipe.ingredients.length === 0) {
      throw new Error("recipe has no ingredients");
    }
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ---------------------------------------------------------------- reads

  get currentIndex(): number {
    return this.index;
  }

  get currentIngredient(): Ingredient | null {
    return this.complete ? null : this.recipe.ingredients[this.index];
  }

  /** Lbs loaded so far for the current ingredient, per the scale. */
  get loaded(): number {
    return this.loadedLbs;
  }

  get isComplete(): boolean {
    return this.complete;
  }

  get remainingLbs(): number {
    const ing = this.currentIngredient;
    return ing ? Math.max(0, ing.targetLbs - this.loadedLbs) : 0;
  }

  // -------------------------------------------------------------- inputs

  /** Feed every reading from the scale here, in order. */
  onReading(reading: ScaleReading): void {
    const previousGross = this.lastGross;
    this.lastGross = reading.gross;
    if (this.complete) return;

    if (this.anchorGross === null) {
      // First reading of the ingredient: whatever is on the mixer now is the
      // baseline. Nothing has been loaded yet.
      this.anchorGross = reading.gross;

      // Explanation: after we fixed the snapshot restore error, `carriedLbs` is dead state soo we just need to zero loadedLbs
      this.loadedLbs = 0;
      this.sendTarget();
      return;
    }

    this.loadedLbs = reading.gross - this.anchorGross;

    // Explanation: bouncing or "jitter" can cause a false positive if the bounce is within toleranceLbs
    const settled =
      previousGross !== null &&
      Math.abs(reading.gross - previousGross) <= this.options.settleLbs;

    if (settled && this.withinTolerance()) {
      this.settledTicks += 1;
    } else {
      this.settledTicks = 0;
    }

    if (this.settledTicks >= this.options.stableTicks) {
      this.advance();
    }
  }

  /**
   * The driver tapped "Next" on the tablet and confirmed the dialog.
   * `confirmedIndex` is the ingredient the dialog was showing when they
   * confirmed. A confirmation for an ingredient that is no longer current
   * must be ignored.
   */
  manualAdvance(confirmedIndex: number): void {
    if (this.complete) return;

    // Explanation: if confirmedIndex == 0 and this.index == 1, "(confirmedIndex > this.index)" would evaluate false and we wouldn't early exit, which would allow the advancement. The previous version failed because it only checked if confirmedIndex was LARGER than the current index, but it should also fail if confirmedIndex is smaller.
    if (confirmedIndex !== this.index) return;
    this.advance();
  }

  // ---------------------------------------------------------- persistence

  snapshot(): SessionSnapshot {
    return {
      recipeId: this.recipe.id,
      index: this.index,
      anchorGross: this.anchorGross,
      loadedLbs: this.loadedLbs,
      complete: this.complete,
    };
  }

  /** Rebuild a session after the app was killed mid-load. */
  static restore(
    snapshot: SessionSnapshot,
    recipe: Recipe,
    head: HeadTransport,
    options: Partial<SessionOptions> = {},
  ): LoadingSession {
    if (snapshot.recipeId !== recipe.id) {
      throw new Error("snapshot does not belong to this recipe");
    }
    const session = new LoadingSession(recipe, head, options);

    // Explanation: I removed the explicit setting of each value below for two reasons:
    // 1. My personal "clean code" philosophy is that direct setting should only be used if you're doing one, maybe two assignments. Anything more than that, especially for code clarity, just use `Object.assign`. So I was going to change this anyway, but....
    // 2. This fixes the issue with the failing session restore because we were assigning `loadedLbs` in two places which caused wrong totals later on in calculation steps. The `Object.assign` solution ONLY assigns the values in the snapshot, which as far as I can tell is all we care about anyway.

    // Destructuring here since `recipeId` does not exist on `SessionSnapsoht`
    const { recipeId, ...rest } = snapshot;
    Object.assign(session, rest);

    return session;
  }

  // ------------------------------------------------------------- internals

  private withinTolerance(): boolean {
    const ing = this.currentIngredient;
    if (!ing) return false;
    return this.loadedLbs >= ing.targetLbs - ing.toleranceLbs;
  }

  private advance(): void {
    this.index += 1;
    //this.carriedLbs = 0;
    this.loadedLbs = 0;

    if (this.index >= this.recipe.ingredients.length) {
      this.complete = true;
      this.anchorGross = null;
      this.head.send({ kind: "RECIPE_COMPLETE" });
      return;
    }

    // The next ingredient starts from whatever is on the mixer right now.
    this.anchorGross = this.lastGross;
    this.sendTarget();
  }

  private sendTarget(): void {
    // Explanation: slight performance improvement here, no need for the re-assignment since it already exists in session memory... assigning the session value `currentIngredient` forces it to take up space in device memory when we've already done that in the session
    // It's a small memory optimization on its own, arguably negligible, but "death by a thousand cuts" is a real thing, especially in lower powered / underpowered devices
    if (!this.currentIngredient) return;
    this.head.send({
      kind: "SET_TARGET",
      ingredient: this.currentIngredient.name,
      remainingLbs: this.remainingLbs,
    });
  }
}
