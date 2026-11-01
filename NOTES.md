# Notes

Use this file however you like while you work. Things we will find useful:

- Assumptions you made, and questions you would have asked the product owner or a teammate.
- What you handed to an AI tool, what it gave back, and what you changed or rejected.
- Anything you noticed in the code that is not one of the three tasks.

## Dave's Notes

### Claude

- the first command I gave to Claude is to parse the project repository to gather all the context for the assignment, and then I also gave it the VAS website so that it had non-project context about the company. Because this is code I did not write myself and need to grok it quickly, I use Claude to get me "up to speed".

- the second command I gave to Claude, and that I always give to any LLM agent I work with, is to act as a junior engineer and I will be the senior engineer. MY job is to make the app work correctly, including writing as much code as I can. If I get stuck, I pass the problem to Claude, have it generate a code solution for me, then I essentially do mini code reviews where I vet what Claude wrote and then paste it in myself so that I ALWAYS know what is being shipped.

### Assumptions

- This is for Loading only. Unloading would be handled in a separate session.
- Driver is adding an ingredient to the scale but not removing anything.
- Drivers are ONLY loading this one bucket until it's completed... no stopping one session and starting on a different one, then coming back to a previsou session, etc etc.

### Possible improvements

- Ingredients should be explicitly marked as "done" in some way, most likely just marking a boolean 'true', instead of advancing an ingredient index. The ingredient index advancement works, but isn't a very robust solution and is implicit.
- I made a very very tiny memory improvement in `sendTarget()`

### Questions

1. Keeping the old anchor after a restart assumes the mixer is in the same state it was when the app died. How long of a gap still counts as resuming the same ingredient?
2. How would a driver UNload something from the scale if they overloaded an ingredient? (assuming their trucks aren't always carrying the EXACT weight for one single mixing session)
