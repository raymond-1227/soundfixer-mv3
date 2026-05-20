"use strict";

// Active tab ID and extension state variables
let tid = null;
let defaultMode = "gain";

// Map to store discovered media elements grouped by frame ID
// Structure: Map<frameId, Map<elementId, elementData>>
const frameMap = new Map();

// Map to cache individual UI control handles for cross-panel synchronization
// Structure: Map<"frameId-elementId", controlObject>
const uiRegistry = new Map();

// DOM Element Selectors
const elementsList = document.getElementById("elements-list");
const allElements = document.getElementById("all-elements");
const indivElements = document.getElementById("individual-elements");
const elementsTpl = document.getElementById("elements-tpl");

/**
 * Updates local cache and dispatches processing configurations to a specific target frame.
 * Uses message passing instead of repetitive script execution for better performance.
 * * @param {string|number} fid - The target frame ID.
 * @param {string} elid - The unique identifier of the target media element.
 * @param {Object} newSettings - Subset of audio configurations to be merged and applied.
 */
function applySettings(fid, elid, newSettings) {
  // Sync state changes with the popup's local cache
  const frameEls = frameMap.get(fid);
  if (frameEls) {
    const el = frameEls.get(elid);
    if (el) {
      el.settings = { ...(el.settings || {}), ...newSettings };
    }
  }

  // Route configurations down to the content script runtime inside the target frame
  return chrome.tabs.sendMessage(
    tid,
    {
      action: "APPLY_SETTINGS",
      elementId: elid,
      settings: newSettings,
      fallbackMode: defaultMode
    },
    { frameId: Number(fid) }
  ).catch((err) => console.error(`[SoundFixer] Frame ${fid} communication failed:`, err));
}

/**
 * Two-way binding helper that links a range slider and a numeric input box.
 * Standardizes inputs, enforces constraints, and normalizes output precision.
 * * @param {HTMLElement} parent - Container node containing the input controls.
 * @param {string} rangeSelector - CSS selector for the HTML range input.
 * @param {string} numSelector - CSS selector for the HTML number input.
 * @param {number} initialValue - Startup value to populate the controls.
 * @param {Function} onChange - Event callback executed on valid input mutations.
 */
function setupLinkedInputs(parent, rangeSelector, numSelector, initialValue, onChange) {
  const rangeInput = parent.querySelector(rangeSelector);
  const numInput = parent.querySelector(numSelector);

  // Enforces boundaries, transforms inputs, and updates both elements simultaneously
  const setValues = (val) => {
    let v = +val;
    if (isNaN(v)) v = 1;
    const max = numInput.hasAttribute("max") ? +numInput.getAttribute("max") : Infinity;
    const min = numInput.hasAttribute("min") ? +numInput.getAttribute("min") : -Infinity;
    
    if (v > max) v = max;
    if (v < min) v = min;

    const formatted = v.toFixed(2);
    rangeInput.value = formatted;
    numInput.value = formatted;
    return v;
  };

  // Initialize UI presentation
  setValues(initialValue);

  // Bind input listeners for continuous real-time changes
  rangeInput.addEventListener("input", () => {
    const v = setValues(rangeInput.value);
    onChange(v);
  });

  numInput.addEventListener("input", () => {
    const v = setValues(numInput.value);
    onChange(v);
  });

  return {
    updateValue: (val) => setValues(val)
  };
}

/**
 * Binds DOM input listeners for a given media control block and populates baseline values.
 * * @param {HTMLElement} container - The wrapper DOM fragment for the control element.
 * @param {Object} initialSettings - Initial configuration snapshot.
 * @param {Function} onSettingChange - Broadcaster callback triggered by any state modifications.
 */
function bindElementControls(container, initialSettings, onSettingChange) {
  const modeSelect = container.querySelector(".element-mode");
  const monoCheckbox = container.querySelector(".element-mono");
  const flipCheckbox = container.querySelector(".element-flip");
  const resetBtn = container.querySelector(".element-reset");

  // Populate base options
  modeSelect.value = initialSettings.mode || defaultMode;
  monoCheckbox.checked = initialSettings.mono || false;
  flipCheckbox.checked = initialSettings.flip || false;

  // Initialize and link gain and pan controls
  const gainController = setupLinkedInputs(container, ".element-gain", ".element-gain-num", initialSettings.gain ?? 1, (val) => {
    onSettingChange({ gain: val });
  });

  const panController = setupLinkedInputs(container, ".element-pan", ".element-pan-num", initialSettings.pan ?? 0, (val) => {
    onSettingChange({ pan: val });
  });

  // Attach structural event listeners
  modeSelect.addEventListener("change", (e) => onSettingChange({ mode: e.target.value }));
  monoCheckbox.addEventListener("change", (e) => onSettingChange({ mono: e.target.checked }));
  flipCheckbox.addEventListener("change", (e) => onSettingChange({ flip: e.target.checked }));

  return {
    resetBtn,
    // Expose programmatic update path to sync changes safely from the global panel
    updateUI: (settings) => {
      if ("gain" in settings) gainController.updateValue(settings.gain);
      if ("pan" in settings) panController.updateValue(settings.pan);
      if ("mode" in settings) modeSelect.value = settings.mode;
      if ("mono" in settings) monoCheckbox.checked = settings.mono;
      if ("flip" in settings) flipCheckbox.checked = settings.flip;
    }
  };
}

/**
 * Coordinates and renders the entire extension interface.
 * Generates both individual track items and the overarching master control layer.
 */
function renderUI() {
  elementsList.textContent = "";
  allElements.textContent = "";
  uiRegistry.clear();
  
  let elCount = 0;

  // 1. Build discrete configuration nodes for every detected media asset
  for (const [fid, els] of frameMap) {
    for (const [elid, el] of els) {
      const settings = el.settings || {};
      const li = document.createElement("li");
      li.appendChild(document.importNode(elementsTpl.content, true));
      li.dataset.fid = fid;
      li.dataset.elid = elid;

      // Labeling item context metadata (Type, sequence index, and activity state)
      const label = li.querySelector(".element-label");
      label.textContent = `
        ${el.type.charAt(0).toUpperCase() + el.type.slice(1)}
        ${elCount + 1}
        ${fid ? `in frame ${fid}` : ""}
        ${el.isPlaying ? "" : "(not playing)"}
      `.trim();
      if (!el.isPlaying) label.classList.add("element-not-playing");

      // Bind input events to remote messaging calls
      const controls = bindElementControls(li, settings, (newSettings) => {
        if ("mode" in newSettings) {
          defaultMode = newSettings.mode;
          chrome.storage.local.set({ defaultMode });
        }
        applySettings(fid, elid, newSettings);
      });

      // Localized reset handling
      controls.resetBtn.onclick = () => {
        const defaults = { gain: 1, pan: 0, mono: false, flip: false, mode: defaultMode };
        controls.updateUI(defaults);
        applySettings(fid, elid, defaults);
      };

      // Register interface reference for global overrides and append to container
      uiRegistry.set(`${fid}-${elid}`, controls);
      elementsList.appendChild(li);
      elCount++;
    }
  }

  // Handle empty state situations safely
  if (elCount === 0) {
    allElements.innerHTML = "No audio/video found in the current tab. Note that some websites do not work because of cross-domain security restrictions.";
    indivElements.remove();
    return;
  }

  // 2. Derive master control panel baseline states from the first responsive element found
  let firstSettings = { gain: 1, pan: 0, mono: false, flip: false, mode: defaultMode };
  let foundFirst = false;
  for (const [, els] of frameMap) {
    for (const [, el] of els) {
      if (el.settings && Object.keys(el.settings).length > 0) {
        firstSettings = {
          gain: el.settings.gain ?? 1,
          pan: el.settings.pan ?? 0,
          mono: el.settings.mono ?? false,
          flip: el.settings.flip ?? false,
          mode: el.settings.mode ?? defaultMode
        };
        foundFirst = true;
        break;
      }
    }
    if (foundFirst) break;
  }

  // 3. Assemble and initialize the "All media on the page" control deck
  const globalWrapper = document.createElement("div");
  globalWrapper.appendChild(document.importNode(elementsTpl.content, true));
  globalWrapper.querySelector(".element-label").textContent = "All media on the page";

  const globalControls = bindElementControls(globalWrapper, firstSettings, (newSettings) => {
    if ("mode" in newSettings) {
      defaultMode = newSettings.mode;
      chrome.storage.local.set({ defaultMode });
    }
    
    // Broadcast setting adjustments to all tracks and update their visual presentation
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        applySettings(fid, elid, newSettings);
        const childUI = uiRegistry.get(`${fid}-${elid}`);
        if (childUI) childUI.updateUI(newSettings);
      });
    });
  });

  // Global reset deck actions
  globalControls.resetBtn.onclick = () => {
    const defaults = { gain: 1, pan: 0, mono: false, flip: false, mode: defaultMode };
    globalControls.updateUI(defaults);
    
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        applySettings(fid, elid, defaults);
        const childUI = uiRegistry.get(`${fid}-${elid}`);
        if (childUI) childUI.updateUI(defaults);
      });
    });
  };

  allElements.appendChild(globalWrapper);
}

/**
 * Injected Content Script Initializer. Runs within the Isolated World of the target webpage.
 * Establishes a persistent communication listener and provisions Web Audio API processing pipelines.
 * * @param {string} fallbackMode - Active operational baseline setting.
 */
function contentScriptInit(fallbackMode) {
  // Prevent duplicate setup footprints on subsequent popup initializations
  if (!window.xSoundFixerInitialized) {
    window.xSoundFixerInitialized = true;
    
    // Core isolated storage registry housing audio nodes securely away from host scripts
    window.xSoundFixerGraphs = window.xSoundFixerGraphs || new Map();

    // Structural JSON request router for inbound adjustment signals
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "APPLY_SETTINGS") {
        const { elementId, settings, fallbackMode: fbMode } = message;
        const el = document.querySelector(`[data-x-soundfixer-id="${elementId}"]`);
        if (!el) {
          sendResponse({ success: false, error: "Element not found" });
          return;
        }

        // Lazy-load Web Audio context graph node chains on demand
        let graph = window.xSoundFixerGraphs.get(elementId);
        if (!graph) {
          const ctx = new AudioContext();
          const limiter = ctx.createDynamicsCompressor();
          
          // Configure protective anti-clipping dynamics parameters
          limiter.threshold.setValueAtTime(-0.5, ctx.currentTime);
          limiter.knee.setValueAtTime(0, ctx.currentTime);
          limiter.ratio.setValueAtTime(20, ctx.currentTime);
          limiter.attack.setValueAtTime(0, ctx.currentTime);
          limiter.release.setValueAtTime(0.1, ctx.currentTime);

          graph = {
            ctx,
            gain: ctx.createGain(),
            pan: ctx.createStereoPanner(),
            limiter,
            split: ctx.createChannelSplitter(2),
            merge: ctx.createChannelMerger(2),
            source: ctx.createMediaElementSource(el),
            mode: settings.mode || fbMode,
            flipped: false,
            originalChannels: ctx.destination.channelCount,
            settings: {}
          };

          // Form structural wiring harness
          graph.source.connect(graph.gain);
          graph.gain.connect(graph.pan);

          if (graph.mode === "compressor") {
            graph.pan.connect(graph.limiter);
            graph.limiter.connect(ctx.destination);
          } else {
            graph.pan.connect(ctx.destination);
          }
          window.xSoundFixerGraphs.set(elementId, graph);
        }

        // Apply parameter modifiers safely
        if ("gain" in settings) graph.gain.gain.value = settings.gain;
        if ("pan" in settings) graph.pan.pan.value = settings.pan;
        if ("mono" in settings) graph.ctx.destination.channelCount = settings.mono ? 1 : graph.originalChannels;

        // Trace routing changes (Compressor mode toggling or Stereo Channel inversion)
        let graphChanged = false;
        if ("mode" in settings && settings.mode !== graph.mode) {
          graph.mode = settings.mode;
          graphChanged = true;
        }
        if ("flip" in settings && settings.flip !== graph.flipped) {
          graph.flipped = settings.flip;
          graphChanged = true;
        }

        // Reconstruct nodes configuration pipelines dynamically if transformations occur
        if (graphChanged) {
          graph.pan.disconnect();
          graph.merge.disconnect();
          graph.limiter.disconnect();

          let lastNode = graph.pan;
          
          // Cross-wire left and right channel positions when channel flip is toggled
          if (graph.flipped) {
            graph.pan.connect(graph.split);
            graph.split.connect(graph.merge, 0, 1); // Left -> Right
            graph.split.connect(graph.merge, 1, 0); // Right -> Left
            lastNode = graph.merge;
          }

          // Route target to terminal speakers or intermediate safety limiter blocks
          if (graph.mode === "compressor") {
            lastNode.connect(graph.limiter);
            graph.limiter.connect(graph.ctx.destination);
          } else {
            lastNode.connect(graph.ctx.destination);
          }
        }

        // Persist internal settings snapshot
        graph.settings = {
          gain: graph.gain.gain.value,
          pan: graph.pan.pan.value,
          mono: graph.ctx.destination.channelCount === 1,
          flip: graph.flipped,
          mode: graph.mode
        };
        
        sendResponse({ success: true, settings: graph.settings });
      }
    });
  }

  // Scan document structure, assign trace indexes, and return state payload
  const list = [];
  for (const el of document.querySelectorAll("video,audio")) {
    if (!el.hasAttribute("data-x-soundfixer-id")) {
      el.setAttribute("data-x-soundfixer-id", Math.random().toString(36).substring(2, 12));
    }
    const elid = el.getAttribute("data-x-soundfixer-id");
    const graph = window.xSoundFixerGraphs.get(elid);
    
    list.push([
      elid,
      {
        type: el.tagName.toLowerCase(),
        isPlaying: el.currentTime > 0 && !el.paused && !el.ended && el.readyState > 2,
        settings: graph ? graph.settings : { mode: fallbackMode },
      },
    ]);
  }
  return list;
}

/**
 * Main application orchestration routine.
 * Resolves persistent properties, injects content scripts, and builds the popup rendering layer.
 */
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get({ defaultMode: "gain" }).then((storage) => {
    defaultMode = storage.defaultMode;
    return chrome.tabs.query({ currentWindow: true, active: true });
  })
  .then((tabs) => {
    if (!tabs || tabs.length === 0) return;
    tid = tabs[0].id;
    
    // Inject core processing layer to all frames targeting the user's active window viewport
    return chrome.scripting.executeScript({
      target: { tabId: tid, allFrames: true },
      func: contentScriptInit,
      args: [defaultMode]
    });
  })
  .then((results) => {
    if (!results) return;
    frameMap.clear();

    // Construct local tracking tables from the collected frame analysis reports
    for (const { frameId, result } of results) {
      if (result && result.length > 0) {
        frameMap.set(frameId, new Map(result));
      }
    }
    // Render out final actionable interface controls
    renderUI();
  })
  .catch((err) => {
    console.error("[SoundFixer] initialization failed:", err);
    
    // Check if it's a browser security restriction page
    if (
      err.message.includes("cannot be scripted") || 
      err.message.includes("restricted") || 
      err.message.includes("chrome://") || 
      err.message.includes("cannot access")
    ) {
      allElements.innerHTML = "SoundFixer cannot run on Browser internal pages or the Chrome Web Store due to browser security restrictions.";
      if (indivElements) indivElements.remove();
    } else {
      // Other unexpected errors
      allElements.innerHTML = "An unexpected error occurred during initialization.";
    }
  });
});