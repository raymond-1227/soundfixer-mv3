"use strict";

let tid = null;
const frameMap = new Map();
const elementsList = document.getElementById("elements-list");
const allElements = document.getElementById("all-elements");
const indivElements = document.getElementById("individual-elements");
const elementsTpl = document.getElementById("elements-tpl");

function applySettings(fid, elid, newSettings) {
  return chrome.scripting.executeScript({
    target: { tabId: tid, allFrames: true },
    func: (ignoredFrameId, elementId, settings) => {
      const el = document.querySelector(`[data-x-soundfixer-id="${elementId}"]`);
      if (!el) return;
      if (!el.xSoundFixerContext) {
        const ctx = new AudioContext();
        el.xSoundFixerContext = ctx;
        el.xSoundFixerGain = ctx.createGain();
        el.xSoundFixerPan = ctx.createStereoPanner();
        el.xSoundFixerSplit = ctx.createChannelSplitter(2);
        el.xSoundFixerMerge = ctx.createChannelMerger(2);
        el.xSoundFixerSource = ctx.createMediaElementSource(el);
        el.xSoundFixerSource.connect(el.xSoundFixerGain);
        el.xSoundFixerGain.connect(el.xSoundFixerPan);
        el.xSoundFixerPan.connect(ctx.destination);
        el.xSoundFixerOriginalChannels = ctx.destination.channelCount;
      }
      if ("gain" in settings) {
        el.xSoundFixerGain.gain.value = settings.gain;
      }
      if ("pan" in settings) {
        el.xSoundFixerPan.pan.value = settings.pan;
      }
      if ("mono" in settings) {
        el.xSoundFixerContext.destination.channelCount = settings.mono ? 1 : el.xSoundFixerOriginalChannels;
      }
      if ("flip" in settings) {
        el.xSoundFixerFlipped = settings.flip;
        el.xSoundFixerMerge.disconnect();
        el.xSoundFixerPan.disconnect();
        if (settings.flip) {
          el.xSoundFixerPan.connect(el.xSoundFixerSplit);
          el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 0, 1);
          el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 1, 0);
          el.xSoundFixerMerge.connect(el.xSoundFixerContext.destination);
        } else {
          el.xSoundFixerPan.connect(el.xSoundFixerContext.destination);
        }
      }
      el.xSoundFixerSettings = {
        gain: el.xSoundFixerGain.gain.value,
        pan: el.xSoundFixerPan.pan.value,
        mono: el.xSoundFixerContext.destination.channelCount === 1,
        flip: el.xSoundFixerFlipped,
      };
    },
    args: [fid, elid, newSettings],
  });
}

function renderUI() {
  elementsList.textContent = "";
  let elCount = 0;

  for (const [fid, els] of frameMap) {
    for (const [elid, el] of els) {
      const settings = el.settings || {};
      const node = document.createElement("li");
      node.appendChild(document.importNode(elementsTpl.content, true));
      node.dataset.fid = fid;
      node.dataset.elid = elid;

      const label = node.querySelector(".element-label");
      label.textContent = `
        ${el.type.charAt(0).toUpperCase() + el.type.slice(1)}
        ${elCount + 1}
        ${fid ? `in frame ${fid}` : ""}
        ${el.isPlaying ? "" : "(not playing)"}
      `.trim();
      if (!el.isPlaying) label.classList.add("element-not-playing");

      const gain = node.querySelector(".element-gain");
      const gainNum = node.querySelector(".element-gain-num");
      gain.value = (settings.gain || 1).toFixed(2);
      gainNum.value = gain.value;
      gain.addEventListener("input", function () {
        applySettings(fid, elid, { gain: this.value });
        gainNum.value = (+this.value).toFixed(2);
      });
      gainNum.addEventListener("input", function () {
        if (+this.value > +this.getAttribute("max"))
          this.value = this.getAttribute("max");
        if (+this.value < +this.getAttribute("min"))
          this.value = this.getAttribute("min");
        applySettings(fid, elid, { gain: this.value });
        gain.value = (+this.value).toFixed(2);
      });

      const pan = node.querySelector(".element-pan");
      const panNum = node.querySelector(".element-pan-num");
      pan.value = (settings.pan || 0).toFixed(2);
      panNum.value = pan.value;
      pan.addEventListener("input", function () {
        applySettings(fid, elid, { pan: this.value });
        panNum.value = (+this.value).toFixed(2);
      });
      panNum.addEventListener("input", function () {
        if (+this.value > +this.getAttribute("max"))
          this.value = this.getAttribute("max");
        if (+this.value < +this.getAttribute("min"))
          this.value = this.getAttribute("min");
        applySettings(fid, elid, { pan: this.value });
        pan.value = (+this.value).toFixed(2);
      });

      const mono = node.querySelector(".element-mono");
      mono.checked = settings.mono || false;
      mono.addEventListener("change", () => {
        applySettings(fid, elid, { mono: mono.checked });
      });

      const flip = node.querySelector(".element-flip");
      flip.checked = settings.flip || false;
      flip.addEventListener("change", () => {
        applySettings(fid, elid, { flip: flip.checked });
      });

      node.querySelector(".element-reset").onclick = () => {
        gain.value = 1;
        gainNum.value = "1";
        pan.value = 0;
        panNum.value = "0";
        mono.checked = false;
        flip.checked = false;
        applySettings(fid, elid, { gain: 1, pan: 0, mono: false, flip: false });
      };

      elementsList.appendChild(node);
      elCount++;
    }
  }

  if (elCount === 0) {
    allElements.innerHTML =
      "No audio/video found in the current tab. Note that some websites do not work because of cross-domain security restrictions.";
    indivElements.remove();
    return;
  }

  // Initialize from first element's settings (like Firefox version)
  let firstSettings = { gain: 1, pan: 0, mono: false, flip: false };
  for (const [, els] of frameMap) {
    for (const [, el] of els) {
      if (el.settings) {
        firstSettings = {
          gain: el.settings.gain ?? 1,
          pan: el.settings.pan ?? 0,
          mono: el.settings.mono ?? false,
          flip: el.settings.flip ?? false
        };
        break;
      }
    }
    break;
  }

  const wrapper = document.createElement("div");
  wrapper.appendChild(document.importNode(elementsTpl.content, true));
  wrapper.querySelector(".element-label").textContent = "All media on the page";

  const allGain = wrapper.querySelector(".element-gain");
  const allGainNum = wrapper.querySelector(".element-gain-num");
  allGain.value = (+firstSettings.gain).toFixed(2);
  allGainNum.value = allGain.value;
  function applyGain(v) {
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        applySettings(fid, elid, { gain: v });
        const eg = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-gain`);
        if (eg) {
          eg.value = v;
          eg.parentElement.querySelector(".element-gain-num").value = "" + v;
        }
      });
    });
    allGain.value = (+v).toFixed(2);
    allGainNum.value = (+v).toFixed(2);
  }
  allGain.addEventListener("input", () => applyGain(allGain.value));
  allGainNum.addEventListener("input", function () {
    if (+this.value > +this.getAttribute("max"))
      this.value = this.getAttribute("max");
    if (+this.value < +this.getAttribute("min"))
      this.value = this.getAttribute("min");
    applyGain(+this.value);
  });

  const allPan = wrapper.querySelector(".element-pan");
  const allPanNum = wrapper.querySelector(".element-pan-num");
  allPan.value = firstSettings.pan;
  allPanNum.value = (+firstSettings.pan).toFixed(2);
  function applyPan(v) {
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        applySettings(fid, elid, { pan: v });
        const ep = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`);
        if (ep) {
          ep.value = v;
          ep.parentElement.querySelector(".element-pan-num").value = "" + v;
        }
      });
    });
    allPan.value = (+v).toFixed(2);
    allPanNum.value = (+v).toFixed(2);
  }
  allPan.addEventListener("input", () => applyPan(allPan.value));
  allPanNum.addEventListener("input", function () {
    if (+this.value > +this.getAttribute("max"))
      this.value = this.getAttribute("max");
    if (+this.value < +this.getAttribute("min"))
      this.value = this.getAttribute("min");
    applyPan(+this.value);
  });

  const allMono = wrapper.querySelector(".element-mono");
  allMono.checked = firstSettings.mono;
  allMono.addEventListener("change", () => {
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        applySettings(fid, elid, { mono: allMono.checked });
        const emono = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`);
        if (emono) emono.checked = allMono.checked;
      });
    });
  });

  const allFlip = wrapper.querySelector(".element-flip");
  allFlip.checked = firstSettings.flip;
  allFlip.addEventListener("change", () => {
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        applySettings(fid, elid, { flip: allFlip.checked });
        const eflip = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-flip`);
        if (eflip) eflip.checked = allFlip.checked;
      });
    });
  });

  wrapper.querySelector(".element-reset").onclick = () => {
    allGain.value = 1;
    allGainNum.value = "1";
    allPan.value = 0;
    allPanNum.value = "0";
    allMono.checked = false;
    allFlip.checked = false;
    frameMap.forEach((els, fid) => {
      els.forEach((_, elid) => {
        const egain = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-gain`);
        if (egain) {
          egain.value = 1;
          egain.parentElement.querySelector(".element-gain-num").value = "1";
        }
        const epan = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`);
        if (epan) {
          epan.value = 0;
          epan.parentElement.querySelector(".element-pan-num").value = "0";
        }
        const emono = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`);
        if (emono) emono.checked = false;
        const eflip = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-flip`);
        if (eflip) eflip.checked = false;
        applySettings(fid, elid, { gain: 1, pan: 0, mono: false, flip: false });
      });
    });
  };

  allElements.appendChild(wrapper);
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.tabs
    .query({ currentWindow: true, active: true })
    .then((tabs) => {
      tid = tabs[0].id;
      return chrome.scripting.executeScript({
        target: { tabId: tid, allFrames: true },
        func: () => {
          const list = [];
          for (const el of document.querySelectorAll("video,audio")) {
            if (!el.hasAttribute("data-x-soundfixer-id")) {
              el.setAttribute("data-x-soundfixer-id", Math.random().toString(36).substring(2, 12));
            }
            list.push([
              el.getAttribute("data-x-soundfixer-id"),
              {
                type: el.tagName.toLowerCase(),
                isPlaying: el.currentTime > 0 && !el.paused && !el.ended && el.readyState > 2,
                settings: el.xSoundFixerSettings || {},
              },
            ]);
          }
          return list;
        },
      });
    })
    .then((results) => {
      frameMap.clear();
      for (const { frameId, result } of results) {
        frameMap.set(frameId, new Map(result));
      }
      renderUI();
    })
    .catch(() => {});
});