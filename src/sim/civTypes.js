// Base civilisation types. Traits are the heritable numbers (mutated from Phase 2);
// behaviour is fixed per type.
//
// traits:
//   fertility        births per adult per tick at full food security
//   lifespan         typical age at death in years (drives elder mortality)
//   foodEfficiency   divides food need (1 = baseline)
//   climateTolerance 0..1, reduces the extra need on desert and mountain
//   aggression       0..1, unused until conflict lands in Phase 4
// behaviour:
//   migrateThreshold pressure (population / carrying capacity) above which groups leave
//   migrateShare     share of a cell's people that leave in one move
//   unclaimedBias    how much more attractive unclaimed land is than own land
//   shareFood        share of surplus pooled for hungry cells of the same civ
//   nomadic          abandon depleted cells wholesale

export const CIV_TYPES = {
  expansionist: {
    name: 'Expansionist',
    color: [230, 90, 60],
    traits: { fertility: 0.12, lifespan: 60, foodEfficiency: 1.0, climateTolerance: 0.3, aggression: 0.5 },
    behaviour: { migrateThreshold: 0.35, migrateShare: 0.2, unclaimedBias: 3, shareFood: 0, nomadic: false },
  },
  cooperative: {
    name: 'Cooperative',
    color: [70, 150, 230],
    traits: { fertility: 0.11, lifespan: 66, foodEfficiency: 1.05, climateTolerance: 0.3, aggression: 0.15 },
    behaviour: { migrateThreshold: 0.7, migrateShare: 0.12, unclaimedBias: 1.5, shareFood: 0.3, nomadic: false },
  },
  nomadic: {
    name: 'Nomadic',
    color: [235, 180, 50],
    traits: { fertility: 0.1, lifespan: 58, foodEfficiency: 0.95, climateTolerance: 0.8, aggression: 0.35 },
    behaviour: { migrateThreshold: 0.5, migrateShare: 0.3, unclaimedBias: 2, shareFood: 0, nomadic: true },
  },
  isolationist: {
    name: 'Isolationist',
    color: [150, 100, 210],
    traits: { fertility: 0.09, lifespan: 72, foodEfficiency: 1.25, climateTolerance: 0.4, aggression: 0.1 },
    behaviour: { migrateThreshold: 0.85, migrateShare: 0.1, unclaimedBias: 1, shareFood: 0.1, nomadic: false },
  },
  aggressive: {
    name: 'Aggressive',
    color: [200, 40, 90],
    traits: { fertility: 0.15, lifespan: 52, foodEfficiency: 0.9, climateTolerance: 0.3, aggression: 0.9 },
    behaviour: { migrateThreshold: 0.55, migrateShare: 0.18, unclaimedBias: 2, shareFood: 0, nomadic: false },
  },
};

export const CIV_TYPE_IDS = Object.keys(CIV_TYPES);

/** Distinct colours for repeated types, so two Expansionists are still tellable apart. */
export function civColor(typeId, nth) {
  const [r, g, b] = CIV_TYPES[typeId].color;
  if (nth === 0) return [r, g, b];
  const shift = nth % 2 === 1 ? 0.55 : 1.35;
  const k = 1 + Math.floor((nth - 1) / 2) * 0.15;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (shift > 1 ? shift * k : shift / k))));
  return [f(r), f(g), f(b)];
}
