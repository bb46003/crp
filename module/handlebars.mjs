export function registerHandlebarsHelpers() {
  Handlebars.registerHelper({
    eq: (v1, v2) => v1 === v2,
    ne: (v1, v2) => v1 !== v2,
    lt: (v1, v2) => v1 < v2,
    gt: (v1, v2) => v1 > v2,
    lte: (v1, v2) => v1 <= v2,
    gte: (v1, v2) => v1 >= v2,
    and() {
      return Array.prototype.every.call(arguments, Boolean);
    },
    or() {
      return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    },
    range: (v1, v2, v3) => checkRange(v1, v2, v3),
    not: (v) => !v,
  });
  Handlebars.registerHelper("lowercase", function (str) {
    return str.toLowerCase();
  });

  function checkRange(v1, v2, v3) {
    const ouput = v1 >= v2 && v1 <= v3;
    return ouput;
  }
  Handlebars.registerHelper("log", function (log) {
    console.log(log);
  });

  Handlebars.registerHelper("isUserGM", function () {
    const isGM = game.user.isGM;
    return isGM;
  });
  Handlebars.registerHelper("profesja", function (profesja) {});

  Handlebars.registerHelper("range", function (start, end) {
    start = Number(start);
    end = Number(end);

    const result = [];

    for (let i = start; i <= end; i++) {
      result.push(i);
    }

    return result;
  });

  Handlebars.registerHelper("zawodowa", function (umiejka, umiejkiZawodowe) {
    if (umiejkiZawodowe.includes(umiejka)) {
      return true;
    } else {
      return false;
    }
  });

  Handlebars.registerHelper("efekt", function (efekt) {
    const efekty = {
      brak: "-",
      sprawnosc_inicjatywa: "Sprwaność i inicjatywa",
      parowanie: "Parowanie",
      ciezka_rana: "Uławienie przy Cięzkiej Ranie",
    };
    switch (efekt) {
      case "brak":
        return "-";
      case "sprawnosc_inicjatywa":
        return new Handlebars.SafeString(
          "<i class='fas fa-running' data-tooltip='Sprawność i inicjatywa'></i>",
        );
      case "parowanie":
        return new Handlebars.SafeString(
          "<i class='fas fa-shield-alt' data-tooltip='Parowanie'></i>",
        );
      case "ciezka_rana":
        return new Handlebars.SafeString(
          "<i class='fas fa-heart-broken' data-tooltip='Uławienie przy Cięzkiej Ranie'></i>",
        );
    }
  });
}
