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
 
  Handlebars.registerHelper("range", function (start, end) {
    start = Number(start);
    end = Number(end);
    const result = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  }); 
}
