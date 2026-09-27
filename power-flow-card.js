// Power Flow Card
// A Home Assistant Lovelace card showing house, battery, solar and grid
// as circles connected by animated, colour-coded power lines that merge
// into a single multi-colour arrow at the house, and hide entirely when
// a source has no power flowing.

const AMBER = "#BA7517";
const TEAL = "#1D9E75";
const BLUE = "#378ADD";
const CRITICAL = "#E24B4A";
const WARNING = "#C98A1F";

class PowerFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (!config.house_power) {
      throw new Error("power-flow-card: 'house_power' is required");
    }
    this._config = {
      battery_warning_pct: 50,
      battery_critical_pct: 20,
      ...config,
    };
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  _num(entityId) {
    if (!entityId) return 0;
    const s = this._hass.states[entityId];
    if (!s) return 0;
    const v = parseFloat(s.state);
    return isNaN(v) ? 0 : v;
  }

  _fmt(w) {
    const abs = Math.abs(w);
    if (abs < 1000) return `${Math.round(abs)} W`;
    return `${(abs / 1000).toFixed(1)} kW`;
  }

  _skeleton() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:16px 8px; }
        .pf-wrap{position:relative;width:100%;max-width:380px;height:175px;margin:0 auto;font-family:var(--paper-font-body1_-_font-family, sans-serif);}
        .pf-node{position:absolute;width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:0.5px solid;cursor:pointer;transition:opacity .3s;}
        .pf-node ha-icon{--mdc-icon-size:28px;}
        .pf-kw{font-size:14px;line-height:1;font-weight:500;}
        .batt-icon svg{width:22px;height:31px;display:block;}
        .teal{background:#E1F5EE;border-color:#0F6E56;color:#085041;}
        .amber{background:#FAEEDA;border-color:#854F0B;color:#633806;}
        .blue{background:#E6F1FB;border-color:#185FA5;color:#0C447C;}
        @media (prefers-color-scheme: dark){
          .teal{background:#085041;border-color:#5DCAA5;color:#E1F5EE;}
          .amber{background:#633806;border-color:#FAC775;color:#FAEEDA;}
          .blue{background:#0C447C;border-color:#85B7EB;color:#E6F1FB;}
        }
        .pf-house-outer{position:absolute;width:72px;height:72px;cursor:pointer;}
        .pf-house-inner{position:absolute;left:6px;top:6px;width:60px;height:60px;border-radius:50%;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#fff;}
        .pf-house-inner ha-icon{--mdc-icon-size:26px;}
        .pf-house-inner .pf-kw{font-size:13px;}
      </style>
      <ha-card>
        <div class="pf-wrap" id="root"></div>
      </ha-card>
    `;
    this._root = this.shadowRoot.getElementById("root");
    this._built = true;
  }

  _fire(entityId) {
    const ev = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.shadowRoot.dispatchEvent(ev);
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) this._skeleton();

    const c = this._config;
    const housePower = this._num(c.house_power);
    const solarPower = this._num(c.solar_power);
    const batteryPower = this._num(c.battery_power);
    const gridPower = this._num(c.grid_power);
    const soc = c.battery_soc != null ? this._num(c.battery_soc) : null;

    // Fixed row layout: house, battery, solar, grid (extra gap after house)
    const ROW_Y = 108;
    const TOP = 72;
    const HOUSE_X = 55;
    const BATTERY_X = 160;
    const SOLAR_X = 235;
    const GRID_X = 310;

    const sources = [];
    if (batteryPower > 0) {
      sources.push({ key: "battery", x: BATTERY_X, busY: 51, color: TEAL, power: batteryPower });
    }
    if (solarPower > 0) {
      sources.push({ key: "solar", x: SOLAR_X, busY: 43, color: AMBER, power: solarPower });
    }
    if (gridPower > 0) {
      sources.push({ key: "grid", x: GRID_X, busY: 35, color: BLUE, power: gridPower });
    }

    const sliceWidth = 6;
    const totalWidth = sources.length * sliceWidth;
    const startX = HOUSE_X - totalWidth / 2;

    let linesSvg = "";
    let dotsSvg = "";
    let wedgeSvg = "";

    sources.forEach((s, i) => {
      const x0 = startX + i * sliceWidth;
      const x1 = x0 + sliceWidth;
      const termX = (x0 + x1) / 2;
      const path = `M${s.x} ${TOP} L${s.x} ${s.busY} L${termX} ${s.busY} L${termX} 68`;
      linesSvg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`;
      wedgeSvg += `<polygon points="${x0},68 ${x1},68 ${HOUSE_X},79" fill="${s.color}"/>`;

      const speed = Math.max(0.6, 4.5 - s.power / 800).toFixed(2);
      dotsSvg += `
        <circle r="3.5" fill="${s.color}">
          <animateMotion dur="${speed}s" repeatCount="indefinite" path="${path} L${HOUSE_X} 78"/>
        </circle>`;
    });

    // House power-mix ring
    const total = solarPower + batteryPower + gridPower;
    const pct = (p) => (total > 0 ? (p / total) * 100 : 0);
    const CIRC = 207.3;
    const solarLen = (pct(solarPower) / 100) * CIRC;
    const batteryLen = (pct(batteryPower) / 100) * CIRC;
    const gridLen = (pct(gridPower) / 100) * CIRC;

    let battColor = TEAL;
    if (soc != null) {
      if (soc < c.battery_critical_pct) battColor = CRITICAL;
      else if (soc < c.battery_warning_pct) battColor = WARNING;
    }
    const battFillH = soc != null ? (soc / 100) * 19.5 : 19.5;
    const battFillY = 29.5 - battFillH;

    this._root.innerHTML = `
      <svg style="position:absolute;inset:0;" width="100%" height="100%" viewBox="0 0 380 175">
        <defs>
          <marker id="pf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </marker>
        </defs>
        ${linesSvg}
        ${sources.length ? wedgeSvg : ""}
        ${dotsSvg}
      </svg>

      <div class="pf-house-outer" style="left:${HOUSE_X - 36}px;top:${TOP}px;" data-entity="${c.house_power}">
        <svg viewBox="0 0 72 72" width="72" height="72">
          <circle cx="36" cy="36" r="33" fill="none" stroke="var(--divider-color, #444)" stroke-width="6"/>
          <circle cx="36" cy="36" r="33" fill="none" stroke="${AMBER}" stroke-width="6" stroke-dasharray="${solarLen.toFixed(1)} ${CIRC}" stroke-dashoffset="0" transform="rotate(-90 36 36)"/>
          <circle cx="36" cy="36" r="33" fill="none" stroke="${TEAL}" stroke-width="6" stroke-dasharray="${batteryLen.toFixed(1)} ${CIRC}" stroke-dashoffset="-${solarLen.toFixed(1)}" transform="rotate(-90 36 36)"/>
          <circle cx="36" cy="36" r="33" fill="none" stroke="${BLUE}" stroke-width="6" stroke-dasharray="${gridLen.toFixed(1)} ${CIRC}" stroke-dashoffset="-${(solarLen + batteryLen).toFixed(1)}" transform="rotate(-90 36 36)"/>
        </svg>
        <div class="pf-house-inner">
          <ha-icon icon="mdi:home"></ha-icon>
          <span class="pf-kw">${this._fmt(housePower)}</span>
        </div>
      </div>

      ${
        batteryPower > 0 || c.battery_power
          ? `
      <div class="pf-node teal" style="left:${BATTERY_X - 36}px;top:${TOP}px;${batteryPower > 0 ? "" : "display:none;"}" data-entity="${c.battery_power}">
        <div class="batt-icon">
          <svg viewBox="0 0 24 34">
            <rect x="9" y="2" width="6" height="4" rx="1" fill="currentColor"/>
            <rect x="4" y="6" width="16" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="6.5" y="${battFillY.toFixed(1)}" width="11" height="${battFillH.toFixed(1)}" rx="1.5" fill="${battColor}"/>
          </svg>
        </div>
        <span class="pf-kw">${this._fmt(batteryPower)}</span>
      </div>`
          : ""
      }

      ${
        solarPower > 0
          ? `
      <div class="pf-node amber" style="left:${SOLAR_X - 36}px;top:${TOP}px;" data-entity="${c.solar_power}">
        <ha-icon icon="mdi:white-balance-sunny"></ha-icon>
        <span class="pf-kw">${this._fmt(solarPower)}</span>
      </div>`
          : ""
      }

      ${
        gridPower > 0
          ? `
      <div class="pf-node blue" style="left:${GRID_X - 36}px;top:${TOP}px;" data-entity="${c.grid_power}">
        <ha-icon icon="mdi:transmission-tower"></ha-icon>
        <span class="pf-kw">${this._fmt(gridPower)}</span>
      </div>`
          : ""
      }
    `;

    this._root.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._fire(el.dataset.entity));
    });
  }
}

customElements.define("power-flow-card", PowerFlowCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "power-flow-card",
  name: "Power Flow Card",
  description: "Animated solar / battery / grid / house power flow diagram with a live source-mix ring on the house.",
});
