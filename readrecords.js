export default async function* RecordByRecord(
  file,
  size = 1024 * 1024 * 10,
  config,
) {
  const r = file.stream().getReader({ mode: "byob" });
  let buf = new ArrayBuffer(size);

  const dec = new TextDecoder();
  const parser = getCSVFieldsParser(config);

  let str = "";

  for (;;) {
    const { done, value: view } = await r.read(
      new Uint8Array(buf, 0, buf.byteLength),
    );

    if (done) {
      break;
    }
    buf = view.buffer.slice(0, view.byteLength);

    str = dec.decode(buf, { stream: true });

    for await (let data of parser(str)) {
      yield data;
    }
  }
  r.releaseLock();
}

function getCSVFieldsParser(config) {
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
  // when parsing a quoted field to know when is done
  let quotedFieldClosed = false;

  function skip(seq, x) {
    let seqlen = seq.length;
    let seqmaybe = raw.slice(x, x + seqlen);
    while (seqmaybe === seq) {
      x += seqlen;
      seqmaybe = raw.slice(x, x + seqlen);
    }
    return x;
  }

  function* parseCSVChunk(chunk) {
    raw = rest + chunk;
    rest = "";

    if (chunkFirst) {
      if (!surroundingSpace) {
        ch = raw.slice(pos, pos + 1); // check for space
        while (ch === " ") {
          pos++;
          at = pos;
          ch = raw.slice(pos, pos + 1);
        }
      }
      ch = raw.slice(at, at + quotlen);
      if (ch === "") {
        pos = 0;
        at = pos;
        return;
      }
      quoted = ch === quote;
      if (quoted) {
        clarified = true;
      }
      inside = true;
      chunkFirst = false;
      quotedFieldClosed = false;
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
        if (ch === "") {
          rest = raw.slice(at);
          at = 0;
          pos = rest.length;
          return;
        }

        quoted = ch === quote;
        if (quoted) {
          clarified = true;
          quotedFieldClosed = false;
        } else {
          // keep the white space skipped in search of a quote
          pos = _pos;
          at = pos;
          clarified = false;
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
              yield [row, errors];
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
            yield [row, errors];
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
        qinx = 0;
      }

      //console.log(at, pos, ch)
      // ch = quote (here it arrives unclarified) | another sequence
      // after is position after the quote found
      // it is expected to be of a field separator
      do {
        const _pos = pos;
        ch = raw.slice(pos, pos + quotlen);
        while (ch === quote) {
          qinx++;
          pos += quotlen;
          ch = raw.slice(pos, pos + quotlen);
        }
        if (pos !== _pos) {
          // have entered prev while
          pos -= quotlen; // last increment in prev while did not found a quote so we decrement back
          pos++; // but move it for the next char
        }
        if (ch === "") {
          break;
        }
        const consecutiveQuotes = qinx > 0 && qinx % 2 === 0;
        const fepmaybe = raw.slice(pos, pos + feplen);
        if (!consecutiveQuotes && fepmaybe === fep) {
          pos += feplen;
          break;
        }
        const eolmaybe = raw.slice(pos, pos + eollen);
        if (!consecutiveQuotes && eolmaybe === eol) {
          pos += eollen;
          break;
        }
        ch = raw.slice(pos, pos + quotlen);
        let askMoreQuote = consecutiveQuotes && ch !== quote;

        if (!quotedFieldClosed && ch === eol) {
          askMoreQuote = true;
        }
        if (askMoreQuote) {
          pos = raw.indexOf(quote, pos + quotlen);
          if (pos === -1) {
            rest = raw;
            pos = raw.length;
            return;
          }
          continue;
        }

        pos++;
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

      field = raw.slice(at, pos).replaceAll(quote + quote, quote);
      if (field.slice(-1 * feplen) === fep) {
        row.push(
          field
            .slice(quotlen, -1 * feplen)
            .trimEnd()
            .slice(0, -1 * quotlen),
        );
      } else {
        ch = field.slice(-1 * eol.length);
        if (ch === eol) {
          row.push(
            field
              .slice(quotlen, -1 * eollen)
              .trimEnd()
              .slice(0, -1 * quotlen),
          );
          yield [row, errors];
          numLine++;
          row = [];
          errors = [];
        }
      }

      inside = false;
      at = pos;
      clarified = true;
      quotedFieldClosed = true;
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
