import readfile from './parse.js';

const fileFrom = (text) => new File([text], 'test.txt', { type: 'text/plain' });
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
  return [ ! out, inx];
};

const size = 4;

const testEqDefaultConfig = (text, expected, fn) => {
  return function() {
    const f = fileFrom(text);

    let recNum = 0;
    readfile(f, size, 
      ([row, err]) => {
        const want = expected.shift();
        if (fn instanceof Function) {
          fn(recNum, row, err, want);
        }
        recNum++;
        let [ok, inx] = eqRec(row, want);
        if ( ! ok) {
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
  return function() {
    const f = fileFrom(text);

    let recNum = 0;
    readfile(f, size, 
      ([row, err]) => {
        const want = expected.shift();
        if (fn instanceof Function) {
          fn(recNum, row, err, want);
        }
        recNum++;
        let [ok, inx] = eqRec(row, want);
        if ( ! ok) {
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
  'ideal unquoted fields': testEqDefaultConfig(
    'a,b,c,d\ne,f,g,h\n',
    [
      ['a,', 'b,', 'c,', 'd\n'], 
      ['e,', 'f,', 'g,', 'h\n'],
    ]),

  'ideal unquoted fields skip empty lines': testEqDefaultConfig(
    'a,b,c,d\n\n\ne,f,g,h\n\n\n\n',
    [
      ['a,', 'b,', 'c,', 'd\n'], 
      ['e,', 'f,', 'g,', 'h\n'],
    ]),

  'leading spaces are kept for unquoted fields': testEqDefaultConfig(
    '      a , b , c, d     \ne     ,    f , g,    h\n',
    [
      ['      a ,', ' b ,', ' c,', ' d     \n'], 
      ['e     ,', '    f ,', ' g,', '    h\n'],
    ]),
};

const unquotedIdealWithConfig = {
  'ideal unquoted fields keep empty lines': testEqCustomConfig(
    'a,b,c,d\n\n\ne,f,g,h\n\n\n\n',
    [
      ['a,', 'b,', 'c,', 'd\n'],
      ['\n'],
      ['\n'],
      ['e,', 'f,', 'g,', 'h\n'],
      ['\n'],
      ['\n'],
      ['\n'],
    ], 
    {skipEmptyLine: false,},
  ),
};

const unquotedMalformed = {
  'malformed unquoted fields with quotes': testEqDefaultConfig(
    'a,b "a,c,d\ne,f " ,g " ,h\n',
    [
      ['a,', 'b "a,', 'c,', 'd\n'], 
      ['e,', 'f " ,', 'g " ,', 'h\n'],
    ], function(recNum, row, err, want) {
      switch (recNum) {
        case 0:
          if (err.length !== 1) {
            throw new Error('unexpected number of errors');
          }
        break;
        case 1:
          if (err.length !== 2) {
            throw new Error('unexpected number of errors');
          }
        break;
      }
    }),

};


tests(unquotedIdeal);
tests(unquotedIdealWithConfig);
tests(unquotedMalformed);

const quotedIdeal = {
  'ideal quoted fields': testEqDefaultConfig(
    '"a","b","c","d"\n"e","f","g","h"\n',
    [
      ['"a",', '"b",', '"c",', '"d"\n'], 
      ['"e",', '"f",', '"g",', '"h"\n'],
    ]),

  'ideal quoted fields skip empty lines': testEqDefaultConfig(
    '"a","b","c","d"\n\n\n"e","f","g","h"\n\n\n\n',
    [
      ['"a",', '"b",', '"c",', '"d"\n'], 
      ['"e",', '"f",', '"g",', '"h"\n'],
    ]),

  'ideal quoted fields containing new lines and commas': testEqDefaultConfig(
    '"a","b has , and \n","c","d"\n"e","f","g","h"\n',
    [
      ['"a",', '"b has , and \n",', '"c",', '"d"\n'], 
      ['"e",', '"f",', '"g",', '"h"\n'],
    ]),

  'ideal quoted fields containing new lines and commas skip empty lines': testEqDefaultConfig(
    '"a","b has , and \n","c","d"\n\n\n"e","f","g","h"\n\n\n\n',
    [
      ['"a",', '"b has , and \n",', '"c",', '"d"\n'], 
      ['"e",', '"f",', '"g",', '"h"\n'],
    ]),

  'ideal quoted fields containing new lines and commas keep empty lines': testEqCustomConfig(
    '"a","b has , and \n","c","d"\n\n\n"e","f","g","h"\n\n\n\n',
    [
      ['"a",', '"b has , and \n",', '"c",', '"d"\n'], 
      ['\n'],
      ['\n'],
      ['"e",', '"f",', '"g",', '"h"\n'],
      ['\n'],
      ['\n'],
      ['\n'],
    ],
    {skipEmptyLine: false,},
  ),

  'leading spaces are kept for quoted fields': testEqDefaultConfig(
    '      "a" , "b" , "c", "d"     \n"e"     ,    "f" , "g",    "h"\n',
    [
      ['      "a" ,', ' "b" ,', ' "c",', ' "d"     \n'], 
      ['"e"     ,', '    "f" ,', ' "g",', '    "h"\n'],
    ]),
};

tests(quotedIdeal);
