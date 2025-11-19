Dev-mode instructions
=====================

Use 'index.html' for production (bundled single-file experience).
Use 'index-dev.html' to load modular UI scripts for development (state_manager, communication_layer, helpers, path_visualization, tuning_algorithms, ui_components).

Important:
- Do NOT include both the bundled JS file (js/main.js) and the modular JS files in the same page; that causes duplicate global declarations and runtime errors.
- This repo centralizes some helpers and shared state in 'js/helpers.js' and 'js/path_visualization.js' to avoid common redeclaration issues.

What changed:
- js/helpers.js provides RB.helpers.delay and a safe global 'delay' alias when not previously defined.
- js/path_visualization.js centralizes path-related variables and functions under RB.path and provides global wrappers like initPathVisualization/addPlannedPathSegment to keep backward compatibility.

Best Practice:
- Use 'index-dev.html' while actively editing UI modules; ensure you don't accidentally include the bundle in it.
- For production, prefer 'index.html' which loads the single main.js bundle (and helpers), and ensures consistent behavior.

If you find duplicate redeclaration issues while testing, check if you accidentally loaded both the bundle and the modular scripts.
