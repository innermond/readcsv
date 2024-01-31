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

  r.onerror = function () {
    console.log(r.error);
  };

  function readNextChunk() {
    const blob = file.slice(offset, offset + chunksize);
    r.readAsText(blob);
  }

  readNextChunk();
}

function getCSVFieldsParser(rowFn, config) {
  if (config?.constructor === Object) {
    var { quote, fep, eol, skipEmptyLine, surroundingSpace } = config;
  }
  // config defaults
  quote = quote ?? '"';
  fep = fep ?? ",";
  eol = eol ?? "\n";
  skipEmptyLine = skipEmptyLine ?? true;
  // white space arounf field is significant
  surroundingSpace = surroundingSpace ?? true;

  const quotlen = quote.length;
  const feplen = fep.length;
  const eollen = eol.length;

  let row = [];
  let errors = [];
  let numLine = 0;

  //field's state
  // content
  let field = "";
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
  let rest = "";
  let pos = 0;
  let ch;

  // counting consecutives quotes
  let qinx = 0;

  function parseCSVChunk(chunk) {
    raw = rest + chunk;
    rest = "";

    if (chunkFirst) {
      if (!surroundingSpace) {
        while (ch === " ") {
          pos++;
          at = pos;
          ch = raw.slice(pos, pos + 1);
        }
      }
      ch = raw.slice(at, at + quotlen);
      quoted = ch === quote;
      if (quoted) {
        clarified = true;
      }
      inside = true;
      chunkFirst = false;
    }

    // parsing loop
    while (pos < raw.length) {
      // begining of a field
      // as inside is changed to false by code executed when a field is done parsed
      if (!inside) {
        ch = raw.slice(pos, pos + quotlen);
        // not enough raw
        if (ch === "") {
          rest = raw.slice(at);
          at = 0;
          pos = rest.length;
          return;
        }

        let _pos = pos;
        if (!surroundingSpace) {
          while (ch === " ") {
            pos++;
            at = pos;
            ch = raw.slice(pos, pos + 1);
          }
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
          field = raw.slice(at, pos - 1 * feplen);
          // field has one/many eol?
          let eolx = field.indexOf(eol);
          while (eolx !== -1) {
            const fieldAtEnd = field.slice(0, eolx);
            row.push(fieldAtEnd);
            const skip = skipEmptyLine && row.length === 1 && row[0] === "";
            if (!skip) {
              checkOuoteInsideQuotedFieldError(fieldAtEnd);
              if (!surroundingSpace) {
                row.forEach((el, i) => (row[i] = el.trim()));
              }
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
          field = raw.slice(at, newline);
          row.push(field);
          at = pos;
          const skip = skipEmptyLine && row.length === 1 && row[0] === "";
          if (!skip) {
            checkOuoteInsideQuotedFieldError(field);
            if (!surroundingSpace) {
              row.forEach((el, i) => (row[i] = el.trim()));
            }
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
      // and found a quote above
      // find next quote only if status of actual quote is clarified
      let isOpeningQuote = false;
      if (clarified) {
        // find next quote
        pos = raw.indexOf(quote, pos + quotlen);
        if (pos === -1) {
          rest = raw.slice(at);
          pos = Math.min(rest.length - quotlen, 0); // save from where to search
          at = 0;
          return;
        }
        isOpeningQuote = true;
        clarified = false;
        qinx = 0;
      }

      //console.log(at, pos, ch)
      // ch = quote (here it arrives unclarified) | another sequence
      // after is position after the quote found
      // it is expected to be of a field separator
      do {
        const _pos = pos;
        while (ch === quote) {
          pos += quotlen;
          ch = raw.slice(pos, pos + quotlen);
          qinx++;
        }
        if (ch === "") {
          break;
        }
        const consecutiveQuotes = qinx % 2 === 0;

        ch = raw.slice(pos, pos + quotlen);
        const askMoreQuote = ch !== quote && consecutiveQuotes;
        if (askMoreQuote) {
          pos = raw.indexOf(quote, pos + quotlen);
          if (pos === -1) {
            rest = raw.slice(at);
            pos = Math.min(rest.length - quotlen, 0); // save from where to search
            at = 0;
            return;
          }
          isOpeningQuote = false;
          qinx = 0;
          continue;
        }
        pos = _pos;

        let after = pos + quotlen;
        ch = raw.slice(after, after + feplen);
        if (ch === "") {
          pos = after - quotlen;
          break;
        }

        // most probable
        if (ch === fep) {
          pos = after + feplen;
          after = pos;
          break;
        }

        // maybe an eol? the next most probable sequence to be
        ch = raw.slice(after, after + eollen);
        if (ch == eol) {
          pos = after + eollen;
          after = pos;
          break;
        }

        // maybe we found a quote. it is an escaped or an ending one?
        while (ch === quote) {
          after += quotlen;
          ch = raw.slice(after, after + quotlen);
        }
        after = raw.indexOf(quote, after);
        if (after === -1) {
          rest = raw;
          after = raw.length;
          pos = after - quotlen;
          return;
        }
        while (ch === quote) {
          after += quotlen;
          ch = raw.slice(after, after + quotlen);
        }

        // here ch is not fep or eol or quote
        if (!surroundingSpace && ch === " ") {
          // maybe some eroneous white spaces
          ch = raw.slice(after, after + 1);
          // eat all ws if any
          while (ch === " ") {
            after++;
            ch = raw.slice(after, after + 1);
          }
        }
        pos = after - quotlen;
      } while (true);

      // raw is too short, need more raw
      if (ch === "") {
        rest = raw.slice(at);
        if (!clarified) {
          pos -= at;
          at = 0;
          return;
        }

        pos = rest.length;
        return;
      }

      field = raw.slice(at, pos);
      if (field.slice(-1 * feplen) === fep) {
        row.push(field.slice(quotlen, -1 * (quotlen + feplen)));
      }

      ch = field.slice(-1 * eol.length);
      if (ch === eol) {
        row.push(field.slice(quotlen, -1 * (quotlen + eollen)));
        rowFn([row, errors]);
        numLine++;
        row = [];
        errors = [];
      }

      inside = false;
      at = pos;
      clarified = true;
      qinx = 0;
    }
    // exhausted raw so refresh its minions
    rest = "";
    pos = 0;
    at = 0;
  }

  function checkOuoteInsideQuotedFieldError(field) {
    if (field.indexOf(quote) !== -1) {
      errors.push(
        new Error(
          `field "${field.slice(0, 10)} ..." of record ${numLine + 1} contains unexpected [${quote}]`,
        ),
      );
    }
  }

  return parseCSVChunk;
}
