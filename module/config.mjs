// module/config.mjs

export const CRP = {};

CRP.attributes = Object.freeze({
  strength: "Siła",
  agility: "Zręczność",
  perception: "Percepcja",
  character: "Charakter",
  reason: "Rozum",
});

CRP.skills = Object.freeze({
  athletics: "Atletyka",
  twoHanded: "Broń dwuręczna",
  endurance: "Tężyzna",
  brawl: "Walka bez broni",
  intimidate: "Zastraszanie",

  oneHanded: "Broń jednoręczna",
  lightWeapons: "Broń lekka",
  craft: "Rzemiosło",
  shield: "Użycie tarczy",
  stealth: "Występek",

  empathy: "Empatia",
  disguise: "Konspiracja",
  survival: "Przetrwanie",
  awareness: "Spostrzegawczość",
  ranged: "Strzelectwo",

  charisma: "Charyzma",
  animals: "Doglądanie zwierząt",
  carousing: "Hulanka",
  gossip: "Plotkowanie",
  willpower: "Siła woli",

  literacy: "Czytanie i pisanie",
  languages: "Języki obce",
  medicine: "Leczenie",
  politics: "Polityka",
  knowledge: "Wiedza",
});

CRP.combatSkills = ["oneHanded", "twoHanded", "lightWeapons", "ranged"];

CRP.itemWeights = Object.freeze({
  M: "M",
  Ś: "Ś",
  D: "D",
  W: "W",
});
