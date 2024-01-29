export default function readfile(file, chunksize, doFn, endFn, config) {
  const r = new FileReader();
  let offset = 0;
  const parser = getCSVFieldsParser(doFn, config);

  r.onload = function (evt) {
    const chunk = evt.target.result;

    parser(chunk);
    
    offset += chunk.length;
    if (offset < file.size) {
      readNextChunk();
    } else {
      endFn();
    }
  };

  r.onerror = function() {
    console.log(r.error);
  };

  function readNextChunk() {
    const blob = file.slice(offset, offset + chunksize);
    r.readAsText(blob);
  }

  readNextChunk();
};

function getCSVFieldsParser(rowFn, config) {

  if (config?.constructor === Object) {
    var {quote, fep, eol, skipEmptyLine} = config;
  } 
  // config defaults
  quote = quote ?? '"';
  fep = fep ?? ',';
  eol = eol ?? '\n';
  skipEmptyLine = skipEmptyLine ?? true;

  const quotlen = quote.length;
  const feplen = fep.length;
  const eollen = eol.length;

  let row = [];
  let errors = [];
  let numLine = 0;


  //field's state
  // content
  let field = '';
  // the situation of quote found is not clear
  let clarified = false;
  // field is quoted
  let quoted = false;
  // field has been opened, we need to find where to ends according to beeing quoted or not
  let inside = false; 
  // position where field has been opened
  let at = 0; 

  let chunkFirst = true;

  let sep;
  let newline;

  let raw;
  let rest = '';
  let pos = 0;
  let ch;

  function parseCSVChunk(chunk) {

    raw = rest + chunk;
    rest = '';

    if (chunkFirst) {
      ch = raw.slice(at, at + quotlen);
      quoted = ch === quote;
      if (quoted) {
        clarified = true;
      }
      inside = true;
      chunkFirst = false;
    }

    // parsing loop
    while(pos < raw.length) {

      // begining of a field
      // as inside is changed to false by code executed when a field is done parsed
      if ( ! inside) {
        ch = raw.slice(pos, pos + quotlen);
        // not enough raw
        if (ch === '') {
          rest = raw.slice(at);
          at = 0;
          pos = rest.length;
          return;
        }

        let _pos = pos;
        while (ch === " ") {
          pos++;
          at = pos;
          ch = raw.slice(pos, pos + 1);
        }

        quoted = ch === quote;
        if (quoted) {
          clarified = true;
        } else {
          // keep the white space skipped in search of a quote
          pos = _pos;
          at = pos;
        }
        inside = true;
      }

      // outside of quotes
      if (!quoted) {
        // Unquoted fields can contain any character except for commas, line breaks, and double-quotes
        sep = raw.indexOf(fep, pos);

        if (sep !== -1) {
          pos = sep + fep.length;
          field = raw.slice(at, pos);
          // field has one/many eol?
          let eolx = field.indexOf(eol);
          while (eolx !== -1) {
            const fieldAtEnd = field.slice(0, eolx + eol.length);
            row.push(fieldAtEnd);
            const skip = skipEmptyLine && row.length === 1 && row[0] === eol;
            if ( ! skip) {
              checkOuoteInsideQuotedFieldError(fieldAtEnd);
              rowFn([row, errors]);
              numLine++;
            }
            row = [];
            errors = [];
            field = field.slice(eolx + eol.length);
            eolx = field.indexOf(eol);
          }
          row.push(field);
          checkOuoteInsideQuotedFieldError(field);
          at = pos;

          inside = false;
          quoted = false;
          continue;
        }
        newline = raw.indexOf(eol, pos);
        if (newline !== -1) {
          pos = newline + eol.length;
          field = raw.slice(at, pos);
          row.push(field);
          at = pos;
          const skip = skipEmptyLine && row.length === 1 && row[0] === eol;
          if ( ! skip) {
            checkOuoteInsideQuotedFieldError(field);
            rowFn([row, errors]);
            numLine++;
          }
          row = [];
          errors = [];

          inside = false;
          quoted = false;
          continue;
        }
        if (sep === -1 && newline === -1) {
          rest = raw.slice(at);
          at = 0;
          pos = rest.length;
          return;  
        }
        continue;
      }

      // we are inside quotes
      // find next quote only if status of actual quote is clarified
      if (clarified) {
        // find next quote
        pos = raw.indexOf(quote, pos + quotlen);
        if (pos === -1) {
          rest = raw.slice(at);
          pos = Math.min(rest.length - quotlen, 0); // save from where to search
          at = 0;
          return;
        }
        clarified = false;
      }
      // pos is of found quote
      let after = pos + quotlen;
      // next pos of field separator expected after quote found above
      ch = raw.slice(after, after + feplen);
      // most probable
      if (ch === fep) {
        pos = after + feplen;
        after = pos;
      } else {
        // maybe an eol?
        ch = raw.slice(after, after + eollen);
        if (ch == eol) {
          pos = after + eollen;
          after = pos;
        } else {
          // maybe some eroneous white spaces
          ch = raw.slice(after, after + 1);
          // eat all ws if any
          while (ch === " ") {
            after++;
            ch = raw.slice(after, after + 1);
          }
          if (ch === fep) {
            after = after + feplen;
            pos = after;
          } else if(ch === eol) {
            after = after + eollen;
            pos = after;
          }
          if ( ! ['', fep, eol].includes(ch)) {
            errors.push(new Error(`line ${numLine}: unexpected "${ch} "`));
          }
        }
      } 
      // found a quote
      while (ch === quote) {
        after += quotlen;
        ch = raw.slice(after, after + quotlen);
      }
      // raw is too short, need more raw
      if (ch === '') {
        rest = raw.slice(at);
        if ( ! clarified) {
          pos -= at;
          return;
        }

        pos = rest.length;
        return;
      } 
      
      field = raw.slice(at, pos);
      row.push(field);

      ch = field.slice(-1*eol.length);
      if (ch === eol) {
        rowFn([row, errors]);
        numLine++;
        row = [];
        errors = [];
      } 

      pos = after;
      inside = false;
      at = pos;
      clarified = true;
    }       
    // exhausted raw so refresh its minions
    rest = '';
    pos = 0;
    at = 0;
  }

  function checkOuoteInsideQuotedFieldError(field) {
    if (field.indexOf(quote) !== -1) {
      errors.push(new Error(`field "${field.slice(0, 10)} ..." of record ${numLine + 1} contains unexpected [${quote}]`));
    }
  }

  return parseCSVChunk;
}


