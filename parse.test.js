import readfile from "./parse.js";

const fileFrom = (text) => new File([text], "test.txt", { type: "text/plain" });
const eqRec = (a, b) => {
  if (a.length !== b.length) {
    fail(`not equals length: wanted is ${b.length} got is ${a.length}`);
  }
  // at least one is not equal
  let inx = 0;
  const out = a.some((_, i) => {
    const areNotEqual = a[i] !== b[i];
    inx = i;
    return areNotEqual;
  });
  return [!out, inx];
};

const size = 5;

const testEqDefaultConfig = (text, expected, fn) => {
  if (!fn) {
    fn = console.log;
  }
  return function () {
    const f = fileFrom(text);

    let recNum = 0;
    readfile(
      f,
      size,
      ([row, err]) => {
        const want = expected.shift();
        if (fn instanceof Function) {
          fn(recNum, row, err, want);
        }
        recNum++;
        let [ok, inx] = eqRec(row, want);
        if (!ok) {
          console.dir(row[inx]);
          console.dir(want[inx]);
          fail(`not equals: wanted "${want[inx]}" got "${row[inx]}"`);
        }
      },
      () => {},
    );
  };
};

const testEqCustomConfig = (text, expected, config, fn) => {
  if (!fn) {
    fn = console.log;
  }
  return function () {
    const f = fileFrom(text);

    let recNum = 0;
    readfile(
      f,
      size,
      ([row, err]) => {
        const want = expected.shift();
        if (fn instanceof Function) {
          fn(recNum, row, err, want);
        }
        recNum++;
        let [ok, inx] = eqRec(row, want);
        if (!ok) {
          console.dir(row[inx]);
          console.dir(want[inx]);
          fail(`not equals: wanted "${want[inx]}" got "${row[inx]}"`);
        }
      },
      () => {},
      config,
    );
  };
};

const unquotedIdeal = {
  "ideal unquoted fields": testEqDefaultConfig("a,b,c,d\ne,f,g,h\n", [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
  ]),

  "ideal unquoted fields skip empty lines": testEqDefaultConfig(
    "a,b,c,d\n\n\ne,f,g,h\n\n\n\n",
    [
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
    ],
  ),

  "leading spaces are kept for unquoted fields": testEqDefaultConfig(
    "      a , b , c, d     \ne     ,    f , g,    h\n",
    [
      ["      a ", " b ", " c", " d     "],
      ["e     ", "    f ", " g", "    h"],
    ],
  ),
};

const unquotedIdealWithConfig = {
  "ideal unquoted fields keep empty lines when told it so": testEqCustomConfig(
    "a,b,c,d\n\n\ne,f,g,h\n\n\n\n",
    [["a", "b", "c", "d"], [""], [""], ["e", "f", "g", "h"], [""], [""], [""]],
    { skipEmptyLine: false },
  ),
  "ideal unquoted fields no surrounding space": testEqCustomConfig(
    " a,  b,  c,  d\n  e,   f, g,  h\n",
    [
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
    ],
    { surroundingSpace: false },
  ),
  "ideal unquoted fields no surrounding space and with empty lines":
    testEqCustomConfig(
      " a,  b,  c,  d\n\n\n  e,   f, g,  h\n\n",
      [["a", "b", "c", "d"], [""], [""], ["e", "f", "g", "h"], [""]],
      { surroundingSpace: false, skipEmptyLine: false },
    ),
};

const unquotedMalformed = {
  "malformed unquoted fields with quotes": testEqDefaultConfig(
    'a,b "a,c,d\n\ne,f " ,g " ,h\n\n\n', // default is to skip empty lines
    [
      ["a", 'b "a', "c", "d"],
      ["e", 'f " ', 'g " ', "h"],
    ],
    function (recNum, row, err, want) {
      switch (recNum) {
        case 0:
          if (err.length !== 1) {
            throw new Error("unexpected number of errors");
          }
          break;
        case 1:
          if (err.length !== 2) {
            throw new Error("unexpected number of errors");
          }
          break;
      }
    },
  ),
  "malformed unquoted fields with quotes, no surroundingSpace":
    testEqCustomConfig(
      ' a   ,b "a ,c,d\n\ne,f " ,g " ,h\n\n\n',
      [
        ["a", 'b "a', "c", "d"],
        ["e", 'f "', 'g "', "h"],
      ],
      { surroundingSpace: false },
      function (recNum, row, err, want) {
        switch (recNum) {
          case 0:
            if (err.length !== 1) {
              throw new Error("unexpected number of errors");
            }
            break;
          case 1:
            if (err.length !== 2) {
              throw new Error("unexpected number of errors");
            }
            break;
        }
      },
    ),
  "malformed unquoted fields with quotes, no surroundingSpace and keep empty lines":
    testEqCustomConfig(
      ' a   ,b "a ,c,d\n\ne,f " ,g " ,h\n\n\n',
      [["a", 'b "a', "c", "d"], [""], ["e", 'f "', 'g "', "h"], [""], [""]],
      { surroundingSpace: false, skipEmptyLine: false },
      function (recNum, row, err, want) {
        switch (recNum) {
          case 0:
            if (err.length !== 1) {
              throw new Error("unexpected number of errors");
            }
            break;
          case 2: // empty lines are counted
            if (err.length !== 2) {
              throw new Error("unexpected number of errors");
            }
            break;
        }
      },
    ),
};

tests(unquotedIdeal);
tests(unquotedIdealWithConfig);
tests(unquotedMalformed);

const quotedIdeal = {
  /**/
  "ideal quoted fields": testEqDefaultConfig(
    '"a","b","c","d"\n"e","f","g","h"\n',
    [
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
    ],
  ),

  "ideal quoted fields skip empty lines": testEqDefaultConfig(
    '"c","d"\n\n"e","f"\n\n\n',
    [
      ["c", "d"],
      ["e", "f"],
    ],
  ),

  "ideal quoted fields containing new lines and commas": testEqDefaultConfig(
    '"a","b has , and \n","c","d"\n"e","f","g","h"\n',
    [
      ["a", "b has , and \n", "c", "d"],
      ["e", "f", "g", "h"],
    ],
  ),

  "ideal quoted fields containing quotes": testEqDefaultConfig(
    '"a","b has and ""a"" b","""c""","d"\n"e","f","g","h"\n',
    [
      ["a", 'b has and "a" b', '"c"', "d"],
      ["e", "f", "g", "h"],
    ],
  ),

  "ideal quoted fields containing quotes and new lines and commas":
    testEqDefaultConfig(
      '"a","b has , and ""\n""","""c"",\n\n,"",","d\n"",\n"\n"""e,,""\n,\n","f","g","h"\n',
      [
        ["a", 'b has , and "\n"', '"c",\n\n,",', 'd\n",\n'],
        ['"e,,"\n,\n', "f", "g", "h"],
      ],
    ),

  "row with ideal mixed fields": testEqDefaultConfig(
    '"a",b has and ,"""c"",\n\n,"",",d\n"""e,,""\n,\n",f 1 2,"g","h"\n',
    [
      ["a", "b has and ", '"c",\n\n,",', "d"],
      ['"e,,"\n,\n', "f 1 2", "g", "h"],
    ],
  ),

  "ideal quoted fields containing new lines and commas skip empty lines":
    testEqDefaultConfig(
      '"a","b has , and \n","c","d"\n\n\n"e","f","g","h"\n\n\n\n',
      [
        ["a", "b has , and \n", "c", "d"],
        ["e", "f", "g", "h"],
      ],
    ),

  "ideal quoted fields containing new lines and commas keep empty lines":
    testEqCustomConfig(
      '"a","b has , and \n","c","d"\n\n\n"e","f","g","h"\n\n\n\n',
      [
        ["a", "b has , and \n", "c", "d"],
        [""],
        [""],
        ["e", "f", "g", "h"],
        [""],
        [""],
        [""],
      ],
      { skipEmptyLine: false },
    ),
  /**/
  "outside spaces are discarded for quoted fields": testEqCustomConfig(
    '      "a" , "b" , "c", "d"     \n"e"     ,    "f" , "g",    "h"\n',
    [
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
    ],
    { surroundingSpace: false },
  ),
  "outside spaced with new lines, commas and quotes inside": testEqCustomConfig(
    '      "a,\n""" , ",\n\n,,""0""b  " , "c", "d"",\n"     \n"""""e"",\n"     ,    ",f"",""\n" , "\n""\n"",g\n"",""\n" ,    "h"\n',
    [
      ['a,\n"', ',\n\n,,"0"b  ', "c", 'd",\n'],
      ['""e",\n', ',f","\n', '\n"\n",g\n","\n', "h"],
      [""],
    ],
    { surroundingSpace: false },
  ),
};

tests(quotedIdeal);
