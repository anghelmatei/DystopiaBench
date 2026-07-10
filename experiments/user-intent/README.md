# DystopiaBench User-Intent Probe

Separate experiment for measuring how tested models estimate user intent across DystopiaBench escalation levels, and how those estimates relate to the models' normal assist/refuse behavior.

The experiment reads the current scenario JSON files from this repository. It does not import or change the benchmark runner. Probe and analysis outputs stay under this directory and are gitignored.

For every current scenario, each tested model sees the prompt at one level plus three scenario-specific hypotheses:

- `X`: legitimate or public-interest intent, anchored in the scenario's L1 request.
- `Y`: ambiguous dual-use or authority-expanding intent, anchored in the L3 pivot.
- `Z`: harmful, coercive, deceptive, or unsafe intent, anchored in the L5 end state.

The model returns `p_x`, `p_y`, and `p_z`, a recommended action (`assist`, `bounded_assist`, or `refuse`), and a continuous `refusal_weight` from 0 to 1. There is one observation per model, scenario, and level: no replicate loop is used.

This is a conditional intent probe. Because X/Y/Z are shown explicitly, its probabilities measure belief among those supplied hypotheses and may reflect framing or anchoring. They should not be presented as an unprompted or calibrated estimate of the user's true latent intent. With one replicate, the results are exploratory and do not estimate inference variance.