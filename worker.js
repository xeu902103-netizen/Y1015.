/**
 * 音乐下载器 · Cloudflare Worker 版
 * 支持：网易云（扫码登录）、QQ 音乐、酷狗
 * 纯 Worker（ES Module），不需要 KV / D1 / 任何付费服务
 */

/* ============================================================
 * 内嵌 qrcode-generator（MIT，Kazuhiko Arase）
 * ============================================================ */
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));
/* ============================================================ */

/* 赞赏码图片（内嵌，base64）：1 = 微信，2 = 支付宝 */
const DONATE_WECHAT = { type: 'image/webp', b64: 'UklGRjZiAABXRUJQVlA4ICpiAABQYQSdASq0BLQELjkolEohI6Ojg4A4S0t3C5lwB/PfwA2APAPwf7AfoJIkcgPkA1QD5ANoA/gH2AbgBtAGwA/gH8A/wX8A/SH9//4BuZf9fwD+LfwD8AP0A/QX/n//7Gg/7d0vKBPAP0AqwH8K/QD//7IB///TM/APEF6q+4B+g/9U///7BfwD/////7AP///Iv//ld/6rX1I/TzB9Vr6kfp5g+q19SP08wfVa+pH6eYPqtfUj9PMH1WvqR+nmD6xxmUV5GGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXE4vU4rQ+CiYOJ1/wXrouSaI3Qx3uGD2GHk0RuhjvcMHsT76K8GJyh9uqmswkuCiO6DkdlxSv2kddtU00GBDvgAsYU3c3/6bBWle04rQk6OLLJoMCuTdXz0SVceS9y3CB0V7D04H7ouw9ZQA2gWsbmCOFZKlzho0p/DwG6UIAAhYApRGrvvGy6lQ6KjsVi9CM81Zf+oN7AJu1i9CM8qfYLPKYxqgCbRoOCOXHHGfwdDljWhb69koOUUg11TsdBm7x3gKmcakN86EmmMQFJDAC7Vr04H7ouw9ZQA2gWrA7R8MdtNA16cD998vKvM/gAzKK8jEpzk3GwOVgeMD6wDsJgo8IDsJgT+0v/9QRna/SUICngKx5AAWNGsm6us3UcBWMzN+1fYwrGHibsCezP1zCsw2KbVKgOfq72NepRUky3zZKF8k16Rf86/9hU9s6eUQJtRRrK9VxDMoijPrqFFwQsdmRWKCemOFYg3f/qCM38h9Lr6vq9V3Hr6/QVDkRpuHNRwoZmiSrjyX3rASfd2J1FclN9FiuVgeYOAl3GrzN5GMJ6QHhAAvJt845mTnVvyKttSUCKx186uEsIWELCFh1tsIT+B4XAOWX/5NvnIUOJbwVVpgEh2EjlyUFzMm78pOM9McKyaiy974rvj5oEq4m1HkvctZhiLmeN8DsNiSkC8GGT2soCtsuJPF+ADJdqETM+n8NzQTEcu9SMyivIwwi6n0/GavID9bkaAIkm7kQEc7aE6KwyfXapJYckWWl5aVcP27xycZlFeRhhKrHK6htAyX32ssvCBqtXlsBL5n4f2V5hetiiflhsTp91dav3WB+tzEURMpK0wwkq48HyDu3KVVYekORFiMwsUzpipkRf1Bs/bn2PiJWQTCPvtVOznFGOQTmtQXuWswwkrvtuw6xngE7OQHq2lVESS7Eo4VkqXOF4V85K6aqiHkzYWbCzVrXVHgVH+uEeZhHVoJpetkLJV4+5dMNw2CA9UKHiI7FYvQjPKn17vyeX7S+WrpD2FszSCiYlqFpHZq3mXbur7TxxZdNXerCpImPV99U8YQPA6DN3kDLcpbanZFlpeMXEz9N/3GElXHkvct5EYTWQsoAbQLVgcrA8YH1gGFsWmOeh+bBlO2wy17cjESW01gonV9HhW2Oiyfm6L+/7lg1fheh2popr5AEZGUKuk1t4V+zx2fR/WnOkTBKLqbEVso/zrx1aEZ835g3f9i1yrzAyf7LS1GCq2QsZQ5OePRX6//QepHgbPGiVJ2a7M6wlJQb1frvVdyzKKhYLEo8l7lrMLxWhiHgcv209o6qwhVVhCqrCFVWEKqoSm2Tg0JLFwRxD+gZH/ELEXIwu7asKDGpZIvI/KGN0FRBmN+WNOfEOxp0a+8WKcSHAS7jMkCc01IGnHbj+Po+nNZWiIucbi43kDtmJcim8loXcqyocGXA+4H/uzImwV9SwQNVq8YH1gHYTAn6OFWrA5tjkVK7OL7AQWbl46yivIwwkq48l7lrMMJVbBlmVu+uxC+PxJCTDCKxS9m5AtnB9srr3kXzBdziu+oyX6kDCShcUGvxA0T/EseS9y1mGElXHkvctaJw1uJx5L3LWYYSVceSkdcqCm2S49y07saAjbvfquPKTaIJchZhFaHM+o0VigndF2xyV6hyAu9clW1ib5BHgFnpHkr1DIppkI1i0TB3AYrgKBkLqAGCibzZmaVU0nNEDqAGZRXkYR0RJWmlMxUowl4nxp0kBEuULc0fh7HwB56NX8NbyWj33tCj5Vy4LzKyOnCJwkHhdYPH1KVETeGMg3WZRnlzO9EVQysojlbFsge6VMbpE78G7DgdezgBTwzUfsp/ikbi3IGqg0SosPOlwZt88Xqtpx24/j/Yrq2QffDZrxJOETeadWG4knLaswwkq48igeWGBi5QouBy7r8NEyT/fNMrflcYs6yCZLyvU9KfAPEipVKTMa8e9yLArCM6TohNSdzNfOg7qcrQgeB/5CZjXj3amMOKFYOCik3Gh5SqA3XvfPjyfKjYBZfAvNy5HPbDdNkqygaJExWEsQb0IAQfRo/r+AVuaX1mAIjtOf9KDc+Q02nGz+Ek1RZQvkmvYEGSm1LWYYSVcIuEu3b7kyPgULE9jFk25dKqCQRpw+1DRI7dyxCkjNTjXP7j90xKm+zbHDp7BHT0sIVNRwVf09IqvW7slQNVuyLk1Dtk/I6KcxcYvBHOitmQewPYGTTH2MnAvBgSdV1xGUlmUuyvAjXrW5WnQUkvD+auLHZbYevwAZlFeyNfQBV0JqdIWLjq8jC4sw+hDxldUlxKq5Xdqx5PsY7UIlKrJW/TUb0qyaipKGtQ8DB/VBC5GgCRin4eswqpsj04kNnRo/MZr9KuN4/iCzNElXHkvcuPqK/jtxZlI9xzzzPSvDZN5SUq1v5SwbX3rEhXYR5MdJknqBbtzM0wD7YH8iBeTnlXeZ7nnlzEKijOck1dV3s47tbTfRFhIKtCpXAgXnsU+vBAWjpFKG64MgEd5a/ABmUV5F8SP5kr79irRkG69wTK1JZUib2wAKmnMdU0a9GtuXKufkRAy8m79DRaw8YZleFHypUG09V/arSk5eJ8ZmRxyKsSPh/c4XhX0XirMlAoRoCHiy7tqeEEp1+zUNdU23W28DMHtQpEHdKj2qGQ1YHHcvNintgbP9p1zVhi5KxIFPKG0uf3AWmIj7sPrtVRzpXMoryMMJExWBycEbfMjZq8R6E4YIVa1UMf5PnXtR7D7bwHxy+WYx8nmVNaqywVGeh+bBlO0nZ22tJN4zmY0EudXL1BuFDBHKwPOwXOleWf3Mqj49BFtT0ACI07dd5WodjPLcBownAs8cYrhJBWsWLyb0BW84iWfsA923UWaQz7dRqxJVmmJ18Rbtj+VZ19mlXuWswwkq6EE4KuUiUw7AmTEkS0pF14/ShynrUAW0zzcMkPsKqReRklGaI2tmNB3ZuKHEcg+PqfH0wFnHla9puxVqiiHvUZpgEh2Nhl5zx3/RbvykFobAzzT49HM7Gx6rlJjbzz1urCAnNMtCwJyPdFrl/eWe0RWYtYxJfPtnPRYkV3saL2damWpgAZlFeRhiOHnWnqpgOh4lHkuFbHwElKIdyXuV/g4jmI4evwAZjtVHNEakbmSLF12oBhFPu+XnvUaBU5OwufL7WOkoPj4BjRamYkcswuh3s3LWYYSVddhHeUtxLizKR7jY+tmXnQdu/wg2xK61x7EE/C8Fcpy+fkVL1KHNoUqJARED00rwfWFxPlXearSpAgjHff+JXoFcygXpZyn/qqJNqMhRaYSl+1KAH/s1lGmM4nkYYSVcd4E/fzpwRfA4v+wy6p33ZfaXQVRLko+Y+L+KaXyxWctcTqTOeOMzplrVlyptfiCr71+jejstC0wmDKI6IkrfBLrYsmOxWL0Iz5MsZ5DHUblGK3mB7QEwcSiE4VQl5mUvzOys0ab+aOgcbmWWPwGV151F/8xBxRZacPycrFO/RWPnVh8QrYFrgHzWyASv9ZhhJVx5FA8sMDFyhRcDRVblhK/P05Rkj93se69oSmMXQV0uYSo3Lv1xQvfFZRoBnSlGDYWt4eVIvpVnJ8c0513do6RZ21JEVDNQXEZzLWE2Qglf6v66zC8PI8IShutXCeuhKYC6Yq6mxFbKP84yumq9Ssota4SWzyawokArQ5PyfOvaj1ED3v5zNElXHkmo7+tzMuwMz0NT9pVvJeTkVw/BS8MKRRRJY4PDkqsiaDnb1td+dQHDs8fpNSvq3hK/Jz3KCDwNLgboXlPWmS55m+9IL+iyju2Je7eCH3zaRKfa6bWzGhLP13joKSstfZ+ZRevoIjmi/SfidmnrT1qALmeODL3LWYYSVxoZeZPv1fZjoeFVivhaAgAslh3XJytE/xK0jijCN8qHZRXEb4Aq6GrrhQvUkFobC5EeJR5Luu00Vl+lblkJWWlXHjsXer7L4gEa9iTsg5l7ldpvtmGElXHkv4LgZrOPhO4EXgxOFWxSxnCr29lgiKdaeJmL4igjLRdqWpu8BPVT/33ZrVGQ2hi4sRrv8MSJPI55qmVhSa/1ejSQyOwtlMqPAygrRDWVX7qtKjrMBtteqEfvCtDyNhvshHkvctZhhFEwTZROUmJPzLQbr91qFSZzxxoNnNHvMy1O1PJfHlX/wIJgtVLnC8LRw1YELL7qcNgiRfxM/8QL6+/qpRPYrEiD+s0WhSs8p4H2u4ztQszjFk/+Xwtc73RBZRBqw/+66/iUjVAFQ0da5FPOmwAKjr6KwwchKoqhlZo0FWS4AMyivIlasJYg3EAC9sR9CrSK/E79b032e/CUlBvV9zAat/Ow9eyMU8U6K3LA5OCNuuQoH8qLC1vDJnkQFvHlgRUyJeRfahIOtBjfXsgBkAq6bQoa1/wPzYMp2nMdMo+iQRLjWU6gIqmbkZoKsW1TMPDvgoHlhjbfPSkBjlplGHvxDtV2W5e5azDCSlLO4jcY50pXTfyj1bCYUQKIM2e17dPzgfui7Ef7nw1GccYnH+czc6K77iGFXMLMNBIlWbIAoFjDKRqXb5qQi72agHiS+tYbcwbd7TlJXgJxFrULPaVjW9XWhsamsm2BYQsIWRcK5nDQnpAae4HNMzS2W8KGIMovwAZlFeRhd6kZ5Q/BAZkQGxsSV38UHYuxFyMokeHjpmMZeK77bsOk+J+IcIBXDEFGZmJA/JTh8jC7tqxKPgbUsFXPJEr6lXT+cgM79D+G6VdB8Mej6K8gyVDsqbuipM4AZlFeRhhLTNKdwH2hw0hUyU/LDXlzOcUY7LGmwC76fv1Q+z2+cI3jXlUqpVd7/tPT+Pph6HHtAAVkGMDPkmqZ+GzWqJWlBP+mhxjuYIzUd1yXxto03eLITsXYmN1+aj8s4WdLN6pZa+TfAc6rjyXuWsmq1txOnxyEQEfktEjicdLX6AZ8TgGcAGF8UeS4wV4b928jPVnP9VOhlMs6AOAFOYCjc9f2q0pOXyqDp3NHCbw4CMfsYFAn7+noyz2BkEazCzBYcIJvD+TC237D7nSSEJxHzt/OarVgdpEvUXk3hAMfRXkVLbuRf7KLNfUDnnsUk0XFObvhsi+ha1eRhhJVx8BAeHX/Yc6rWq78KO23W5myudowuQN0KDe6LYBXNW8T5+D9DSW+1KXtz673dEhs6v2qAyTgGz5XL6Nploo2elIRfZmByki8ELKxdGiyrI9FY0hRmw0QmpNTgjXYcb1G1KBm0DiSvUm/Cjtt1uZsrnHUNmSEpKDer9d7NKKsXsA4RPlxN3VBHorjyXuWsvm+OX+bRN6cSoGR/rsgaezBElM+2V4bGpAG7KSlRahYrCNMdTu0o+Y1fB/mYI34NVfmn77E9igNw4FhvkCagDhyvq/digLjbx5YEU0pxfOmddLRzIhen+KzsMNasYjP8bOlgj8eacbYcqrH0H1fpJ19EqsP/HJ2P82wEpmc0yEhsgAi/ABmUV5GGElXHkuGrzJb2qY5DwmIfBRnXNvxbeT24SVceS9y1mGEq5L+CdcevwAZlFeRhhJVx5L3LWYYSVceS9y1mGElXHkvctZPCpmkCAtG7zvbAvaUkGpnJ63OnSLNnSzPtN73alI0ljfDF1k2/DuhBRR5hjqqvjVDZlkpX6ym4/KC5A9TM8jBOSeKjrLZDKIz+OBqLkdvyoYzEYrVIcTnJbuK+vW0G9X4//BVJST1VE9C1tjmYBs/DXaDG2dy1mGElXC75JIY9u2oSquOpywJqwI5IA+z7M1LF0XpgEqhkeGsXzCzjU++CcAGZAp1qcwoGq1edXFiDmL7NTy/Mzgi+VnQEL2x2tKORMhnd0NCLIfZ0m58MNduwIQ325DG1vL9e8FNucX84nCRoLd7SqzNiW2qYEODM+g/PaaGsSxIAC9rs5b4cgT+OVs/WBxYzNElXHkvb33z5asMNwGKaz84V505jhb/XOEiF2YCxPLB5BuLBBC0U+XL2U91HixPtOgwDZ5crlqa4XZy3w5D/FlueRfVXXj7D7+QdJ7eAAW7kna3oE/sdDpBReqAW7WSN10TvlyKPW0/+90921QfGF4nxoHq2lVElyJbiFXtreyDq8YGxue/ZF4WC8YnlrzUADCEbctZhhJVxy5rFs/YB2pysnmEBOqLzlKIDBz4lQea0emJSKpJL+mo/2eCaEesRBNcmqffqjW15YKlS6el60m6zGH9urxd7eAihHuMUA+hVQXGzYWWBjgT1Lehtdcp0yGPZvI+ArZ+abnuVxi5QYp9iuVgcfC3RzH7j6I8v6ou9OWCH6L26yuIq1HBnXkYYSVccuaxbP25e5atOY8un5CaoZokpXhFyb9iDZe4icjLGiN8p/84CusUsh3JdahgBaZBh+BteeNPP8xOM/4TRa1ctWZKva87SKJCa7yiE298RfCNrIRlf5lZqPbhTb4oSMDmlZP+CUsbVkRJvUeEcMQlXHkvcmIvb3tL3rbA9IucnSLNnSzIULul02+WR4tUyDmKrWalSq1lsr0CuZQl2alSySeLkrteP6zAD6wDsJIE1vg4Al+iXYS8T4vNfv8topmgN9rN8DaUxfyLyyCW5J0s2pi/kaNc0fzkcyXIkHq6nWiZ8P2PbPJiz0HMScJ6x3wAZlFeR8TgHEwGf2dZWYUEYz5YkZPFVm+pbg2KD9dFcye27JNd0zKLihGkkb7Twdenqn9Ia/kIEZkypf/0H4HFO76gf1dUGYztkwkUeajiP7Hl5I3pCNv0/CURAqtu+ns3PC+GlAfYXWHO7UthX49CLZ5qF2DwTBSoz1Jpth6/ABmRGm4c1q1e9O5I+DiXhj2F5F9CjijEGIDNBVjEaDZ+1QeB+bBicRLG0tEFKPcBVf2wa3sURF3+Cc39qFW+GHrKKjJW7hcw81epLdC0cagY6B/rhNEUnteMiDWAKMLJl0HaaaH9zuh8FaV7GNRXkYYSVceQVZdPAknIbQo3PQYeJVx+uVbUvtrbTlwBsvgMdtJR4+Om7czRG1sxoJU8jttIDBrklx7iTiGPRgYxKWpOyl2ZkXa6FPqI2ffDlv0JHqhWSPn9G6HlQw70irIZlQzAZ71XOQoQXZwtGI+GlcyK5kEmjhsc5RdrCrMMJKuPJe5azDCSrj4QlXHkJCo+9O+k/rTVRXkXkAawvXzYNjYkjdXVH+oWWV0LtxGu48d/B6lejqbS+/4F2VUEzFCHQZ/iHCFlR2wderv3qsVc0jsC9EMEz7avX5S5DG6xEBXahLICW/miSrjyXuWlicpqIJLda8thAC8a3vj1FfxySez1xvcReaBu9lvWur+3VTT+PslEhBowvan2m5BITz16o5t5W+9vk8OWeMtiHATCD/PeKvDM2VZiDN1Q9iGBSHIs4qbx0SqqL8J7SZYMLMtsxmb/qC99XwtAwb8v0V5GGElTuWHClCOwO8eQ2gWrA5WBx8LdKVJsUEf+azLVrauQcwUl35MSq4iNV2San6EZip6NAKYBQDxg8hhTQaEfktfD61P1OkFEv3iImPnJy58Jd0jhLxBOaYlrYQUZWS+HJ5D5EdaABXGW9VuLEL0Ry53ewj/hcxvDWD+I8PqgWSYXSiKxflzEb4PCpY5VlG5VKXc1OE9gmzqFjD1+ADMomNBLnV/5bwgcBmQcXmANCACG4Rd9t2HSjyC4bgLv/iT/h2Jwo8iAt6IjhJQDrSdKct8OT9gZx57+wC+1KQLwL4NdelY7LIhjy4DVvHsE3G4kGKLqK45k2z5vSPOFDZiy0XGy8dVYrwAZvg9gtIh7C8EuN0LtSYfcxdUEREonyJ9Urem6AE+lnyq0ITcJSZvdxTYBkdQTEbKzRNYaJKuPJe5Yn+HQx9Sxa3kuiJe7ascwkuZcy1RcdN2b1dmlC26gvhx7L1qPNm8TEHgEsdY5dyrj5IdhMCgBm51BJrhmpUwVCqegRhKpHFtAu1I8jMs8eimDsDV7PNOQj9u88xJEqwIaXK3xtcGllgM9nika+7cfWi0KpEOSiha+087EwnanKayhID+AFNxm+1gTgTQurwVaEsPX4AMyiul/iWPJ9j31Zz/mXMQOwnSZxdAOMJKuPJe6M3jqkDEcPX17v+AVpShgdikALtssZr7+bTdYHsh24uKdayVUDl8M3aVXxkX+ZKS5Olv5J98mfkrnmF2yV+3Yr9AW8dSjHUk4eB6CxuNOyDWNF0CnL1pMn7h0yO63LGGElXHkrBn2NWfLWdTuAeKnuYnfDbJtL/bd7lBUHklSyggvGt749RX8bkkJMXqsidqLMRvStmQPRo/IRBUD9aw6fX1V8mA/KOs1BoexH+elGw6FTvPw4plQHpp8tWxiipXLdg5An9rQfQYBFazOeV9iA5CatPk5cLSLMqjD72EWlYVi/ABmUV5DfCqDI7DOD5BqZojD3kAPGQtVeU+MxGAfkhxP73rRYi3Yx8baReoPQBP0XWTQJ++tS8x9H3QqI+SX76+isLEkankGzNQzC8y723xWza2lmyA2O+6eZmOLWK6J3kP3qTY2y/UWwSfGxxzUWN1KgOwybLFmYYhnKctUFu85iz9yBlXPjhv50u33tZhhJVx5Jzv/5CUlBvV+knYBwuzlvhyBSxmMxXDBavnInshjtz673dFlb8rflb8r9oXcrDWykgaSvkapzIxy/mwXazZ47Po/rTnSJh3OiWHogBJmTrFcaTN7L6WV1UbxC1S15GjnEkfxAkZY6cFtFjXfbrgswY4hTua0Exe8TiXtQZerECnBK8D6p3hGdqikUotuWUV5GGElcGqeRWrxgfWAdhMCfo4VasF4K8niPhfI2VfIf1ri0UhHmn2Q+DiuXZucZfZ0sEv0I31DyCXyNIIJyVhwEu4zJAnNNLU0idPCQQ2t0dOnBJFYaGYufWBcHk5iFmTpQFec0r3TRv9B5dfx1rhjKsLPBSPV3LLitUFNPwSMKjC39g+FlJVx5L3LWiZ+2YuRmUPHVBs/bnyZlbsI8L3onlpZXQqQ06zrYnB5UnqC2vHAAAWS++eV1gBU94A0GSYGWrmGgv6b8YHhVBYboCGeUxnNRosh3IpOy2i6BJqXV+VgiXaZu2EG4Tq9ZFLiykZiuEKQs4YqaTDB787NDI85dGX5Mgx3mbYr5kYYSVceT46bsxz65wK0Q1lSo0Gz9uic5h2rQP0RTH3IlokbHk4ww6AZdLVn994X9VHBWk1+yD5EZlEp5exqAw9V/3phnwiJAXgTFwt9ELYz5qU2Z9sEB2BmLgojH/WZBuYMlj+i5LPBdlZXdS7pWksLusu90I9O4etuzDCSrjyX3rASfE2YK8eWkpIwgXpBdxuOfU4KXs15KrITefYzQdVuJ1KT9iwg+KyvljkNpJbJf7DRvBwAfSnVBHcxKpKns7bIvNZfMPI4D1WHcTr1T78+mGPoZ8vMJnL8zrt7OMsgx5tKxmEnpxSSlD5PniB7UNr3N6XCSgqd5xrF4ltQjddl+ADMoryRM/bLn5qxoi6nunjCB4I/KJRqy/XXAFCRlgr+g1BvV+vDMSYgx5JXevzss84RJmapLgcvT7b7PfhKWTBmMsKa4JbwtuC34o5hJA6UJszRYGtFWVEQ+5EJgk4vnUvUJW9NKHLjjf8pU9x7aeIMNGCOfd0aU205lwDMoryMMRczxvJUO1DXT27d02DjPTHCsl8LXO91SRLgfgAOOfgQlOQfj6mXdIy984e19pbyV5knCCRufUjLPoGZESLyFjfOJFRUSEb28bPw+FA+tnU2lpmc3eCraFTMTBNC0yqEQaBrjCtcBK4PVWqE3pE2wHBEw4FR6Vbtz+9c9+jIWUV5GGEld9t2IEtZhefH+xXVyHl8eAZkdN81foZfgCOsDoMyiB14lWwc68i1ATlZ805tYgfWlPkPBo9XnnFzphbnuuB1KbvnCFbZUNHkPuzJ9F3fpxf7nak8CWnjNRXkYYSVdEGq0r2nD/4Hts+YviTNTeDTutr+ehgbYI2C7QoO1IXxHXeIlAMyOkyU4PIQ1EWqGbh7rKBS9fV3sDs8fNmUyqfST78EATz7RKSte+r4WgYNbdmnM7Px7uf/teaH2f12qIf3i6mx5j55icR/OdgTu7YPC9u8eKD+ADMoryL5113IFrjcstVuqNwQGxufTJZOFd41YKdgR4ELvskHZ5fIWbq3iaFHkSAyATXgTF7m2VmQyUuxKjwnqfnqlt2eMqvcsV6qI/FShv/fKXF751PS0nswM7GyixdDNlz5ZFzEl/GEuxiAnhfRkggjyyAb+UYhDgarVyMEmryQ3jsYCxblrMMJExWEr8/T/RkIMQGedOlJ2AcLs5b5eeLf1Bb7PhCMQ6iDy5QzpTbtEKmgqf/pnMl7no8PnNUmeR/upOzXZnWEpKVD5YTIq1GqsTxgLkq8YgZHIg/TivBGM4yFFEnvPWgfgkt6IMWfasjK0uNwoCFhAoQn9iGU3YnXF4I9cEn4aLuizNElXHkUCD9PMoARTtKq5vKpY7/5Q+WVavJ1gT9HCrIm4l2RWc/X8wlvsubM+zbtTiwiFyhoSHWfG8sV2js2QsS6aOAtLOHMVasDlYHjBAACrhd1a3/6rB2qhyuo2fJA7UfavrLeQQtUs9IOgTkQ5t98yjgxo2HicDiI3l94BWGC2YKiz90BsxXk9myzx/sVxjYJNsPX4AMyivH2cVccLWaGYYSVceQ8vhf9b3mSvvZFxe0DR8+OIljjCBd9uadfMFhl25vVpCmeD6IRPodubuFVWxquqEOrpC7/6G88D2y5TsUtT7yTbgTBsWDDiiC+ZETjAcygDRpGTx5jOVRl+WOyEAjFleByP8WeeD61NR9maJKuJrr11XBVWtiifuHC416HwVJYd3sF3rkq2sWP2/pi88/Vw6BeAtO7XNv69ChBgWp2263IOySUgDxBA1jf/Zdh4pbdA1ec+VUTY5rv/isFuJPrAAdM6+1fth+OiqvcS4Xx0Gom5MMJKuPI/+OosP83ajmd+jydSvoduYNunVfFoUwVP/Yi3KTzXEWZvpjwFpAKWcPtgzgpI2xcq+Ro2MLKh1j9/UhmZ1o5eS0KE4jn+VDTYqBRSrjiK7s9hpsNNhpsNNhpsJOmL94vO6pT3kWAqj3yLLXt5w22WX4AHlQrpeWtsOBFbDCMAT2soAbQLVgckSWARihY+ivIwwkq48l7lrMMJKuPJe5azDCSrjyXuWswwkq48l7lrMMJKuPJe5azDCSrjyXuWswwl1keS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVceS9y1mGElXHkvctZhhJVx5L3LWYYSVKAA/r3OuSef2c3ugglEsCb+mEN0h/JPP7Ob3QQSiWBN/TCG6Q/knn9nN7oIJRLAm/phDdIfyTz+zm90EEolgTf0whukP5J5/Zze6CCUSwJv6YQ3SH8k8/s5vdBBKJYE39MIbpD+Sef2c3ugglEsCb+nvpOZ9Ch1vA9Ch1vA9Ch1u3Kn0/BW8D0KHW7cqaznv8PZczIHftbys/wNvQsvSgBygAyaCPdbuI/mgj3W7iP6t2ZN/Jwrkb//7Mb/pX5Y9QrPoKdV9aFUYqe/IZVzqXt2pzcZ2z0rk3L+hcort6RNH8RKZeTi1ADlABm0Ee63cR9tmDJu0+xE4Mqfy9CflLN+x//f/r/vjPj3tr3tldIbFO4M2b/vidPlcek5JImj+IlMnJuX9C5RXfPQflU5uM7Z59HgqjDd6ZWAHho2Mf4mH/RNb6/ZYaRKnAsf9crT6miDR6CJJ4VECAmt9d+jL5DKudS9vWYonDKAHKADPsvSgBygAc9RX+h/Q++NL/e2ve2O8i927azYr+9lJU6+Qj6UvIrlvkevo6JU6+Qj6U/KuVp9TRBsQKI+lP6qARzuZoZ0ESTwcvycYVNZz4qccblOMqdfIZVzqXuKpzcZ2z0rlTufYVytPqZz0Ee63cSCtTm4ztQfIR9KXmFy7DVyeGkW7ZyN//9mN/0r8seoVn0FOq/DME0Ab9ohFTic6aCJJ4WTuKx3CzKn0/HefBO3gehRKpxxuVJyZU4n3epxxuVM1xVGJuc5yWXMnFk4W5PH4JQuYgY5fu01i773VKSW9Rk5+Ut35Ux/oXKK7oTcv6Fyiu7qAHKADEsydl+SJo/iJTIEiaP4iUyVQCOdzBaP0iVOBY98/C2XtImj+IZ9927dImj+IlM2JwygBygBM+sf5P7vb4z498b98Z7yGxUmLXqv72IlUZImj+IlMxUAjncxrbvCcEoAcoAM+zO1ObjO1H8hH0peYUESTwdKM6azDa1qVYjTN2ivCEHmDBs1geanHG5TjJuX9C5RXfPQflQR7rdxH2W74Hak3MICa32AZpIlTgX2vvreLHYBIsAzzu5++hPsm/FTic57L+VOJziswZOFuTx+CULmIGOX7tXdrzEf89awhz8Er9Imj+IlMiSJo/iJTJVAI53MFov+QyrnUve9u6SJU4F5LU443KcyRNH8RKZC5G//+zG/6V+WPUKz6CnVfXhU6+QyrnUvb1vKoI91u4j77L0oAcoAM2gj3W7iPzt4RVGJuX9E1vr9l8FMm8qARzuYOsGmQhXtYxOLUAjncywzigj3W7UmeUAOT/7/k4cm/lT+c7qnHG5Ultf/u93e3xpf74372x3MNm5NGbFf3wbRj8hH0p+YrBT2/5P7vb4z498b98Z7yGxUmLXqv71w186Ys9eVlrWMjl22NM89ChNmKJw5U+n3egj3W7SbaFpjnjamfPXHQR7rdxH11ObjO2ej9IlTgWSHyv3064YZNpPPxPnrasyVTjjcpwuRv//sxv+lflj1CnML1b8d5Jz7vbslADlACqHfIZVzqXt6y9KAHKAFUO+QyrnUvdFurKpZNznPK3ZJE0fxEpkqgEc7mC0YTnPZkFi773VKSW9Rk5+LKmnyEfSoQKty7DVytJASJU4F5LbxrdeVUCbl/QuUV3gm9FTWc+KnHG5Te+QyrnUvdly3yPX7ELt1ZV4nt/yf3e3xnx74374z3kNipMWvVf3tOY//r/1/3xpf74372x3MNm5NGbFf3wbRZObFTjjcp9JEqcC82EBNb68VIlTgXppev5JT8TQR7rdxIIUEe63cSDVTm4ztresf5P7vb4z498b98Z7yGxUmLXqv72IlUcm9KAHKAD3OclTjjcp/k7NUp8fmoTJ2yDjot7s1bU443KbfyGVc6UuT+RevkMq50phnjjDvHa6//y/jbL+Tf/Vht6rZ/6JrfX7J0+ahD6Skybl/QuUV3JQA5QAaVkB//6Y3/Svyx6hWfQU6r68KnE5w1OONym5Oe1Tjjcpvz71btyqMVPpzSswxU1n5SzBKAHKADJsw5U6+QyrnUvcduySJo/iGGrFl6UAOUAF9U443KdxN7KpZN6UAOUAHX5DKudS942Zm3bpE0fxEpo6gEc7mE6n9ZgCo+0v/5P7vb4z497a97ZXSGxTuDNm/74m4bJgvHNu5qJP6Fyiu3JE0fxDMuYl2Iy7cSVPfkMq51L3/5646nHG5Te+QyrnUvf/nup+ag4Tc599t5duuJxnpOHKnc5s1OONynMkTR/ESmRKARzuZYbCfl/h7LmZA79reVn+ROcNl6UAOUAGLb5Ekf5u9f74z498b97ZXGL1UmLNm/72c1OONym98hlXOpezqCPdbuJAKzQksnFqAHKADDoI91u0f85+ToI91u4j6FAI53MsNh8hH0pfK8oFADlACA+QyrnUve1mMs36SP9f+bt8Z8e+N++M95DYqTFr1X97HwN/6bs2Xd/pjx475hXJ5g472/xRtWXfvf/vG//7Al97/hB/juJdSy797/943//YEvvf8IP8dxKKWXfvf/vG//7Al97/hB/juJ9qy797/943//YEvvf8IP8dxg89mf//+4H/3//7CcHO+b6rTmWXy+g3yfLCAWklK6ZhbskiaP4hmXMS7EZduIUAOUAGfbskiaP4hmXMS7EZduMUAjnc0v6FO27Iqj+q2icwGrff/+h0rcRP+f////eU2BmX8CuT8Bx3W/n0rNABwJdq33//odK3ET/n////3lNgZl/Ark/Acd1v59KzQAdHpJnL+wVfAJTdCTb5V/lKWLaCAQCZRFtBHU3//sg/xD5nfvX/5//9//7APsAYtz+Z3fyyji5//3vkf7IP+PUT0L//dtf/1+zv+MYkSX+Q5f/DwTv5V///3NKiZmBmyoXJ8digpf//vbX/9fs7/jGJhpef+P44//qDD/Pf///uYxpf/A8GEKZl8wf/+NQC65br//35PyP/Sx4//8oL/4VUpvPlEBGfVNB4y1YXPaNv/h4J38q///7mlRMzAzZULk+OP+TR9S33//odK3ET/n////3lNgZl/Ark/Acd1v59KzQAcCTarf/9H7/3X3n//8sG/8QoXTces/yPzqAXXSn///odf9Dr/5s/89///+8uuD78C6j8Bx3t/n0m7dFf/oHoFf9Xvcp+5OxMrcB4N7vb//3///zRf4mP5Zh/5K7/wa/pc+Xx/n/+QZNz//0RIf/QLB9r///Q6/6HX/zZ/57///95dcH34F1H4Djvb/PpN1xxfwCbYBKboSr/Kv8lKxbAQCQTKJvgI+j//9h1+IfM79///P//vX/YB9o7F7/zO+/kUc/f/964H+yD/jPkS/AAryqETcv6Fyiu8FTWc7KnHG5Thasu//7xuL7Y/+w6///Hv6kdw///3UEy/+w6///GMT7Qk/+mONl8m38m3//7aZjcHVux+UkLwoTH//0OoQP/QAJNVAf/9mMP+TzoPnv///44Z9/IDjusKIg8ZUvSJ//6HUIH/oAEoqgP/+zGH/J50Hz3///8cM+/kBx3WHUQ9wWyRNH8QqvwhAv/7h/ttPZnv2Qf//4hPjvh7Eh95xxhvOwoX3XyF///qEI/Fc/H5////+QhpPh8zL27YLZCpekT//0OoQP/QAKloSf/THGy+Tb+Tb//9tMxuDq3Y/KSF22XpQA5QAqiE+70Ee63aP/f9E1vr9llUESTwcy7dskTR/ESmQk4Rpef+nt///H0+o0///AkcvQaHRLk/Ae3+J5pef+b3n3+wzx//xn/+B9Kbz5RKFbG8T97/9X//+hiED/rFZzivdSFd8Brfx3AHEAHLwYXC4aQ34D7z/sM8f/+BD/8D6U3nyiUK0+hwKEUUUQE01yBf/943//X7O/47iRUdP/vJ/Ef4mx//+M//xDGB/6M4uT6WgDuOdwY+nmZ//DQR074P9JNzmX8C6j8BmXW/n/8sA4gA7XA4A6AKYtN/4n/Mf7rh///Bj/4tO5Wv3EMCAOIgCtIB//Dn/VD2L/YvI9f/8m2eX50FQv/9f/ywDiIDkAcALNmBf0Gc6kAt/r2f8d8wrk8wcd7f47gDiICXT0H7z0/wfV/8ROXJ+A3q5T+ff+OP2goTJiof/N6nP/0T/VM///hLiHC/nYp1HmD//z//TyAx//aCP8y7Z3PB/aYftBGZazjNM87Bad8/j//sA/9h1+f//f/5mRfaP9gH3r/f+Z33y2jn7//vXA/2HX8aSf/71wP9h1/GhBkLO7/neDdkB//KWHUeYMd1bvEP/nj9fofrglDHlADlAB5+Qj6UvLLMGoAcoAOE/KW/dJH+v/N2+M+PfG/fGe8hsVJi16r+9l7jb/+ff++uP+Yz+Jj//9Jav/lJZWvyvTvj/6PuMQFE0of/3vl/8uT8TH//n6/8Kgbz4L0751ALjgw/+jpkX4Nf//4Sj/w8H57z/0mmO3dPs544lWTzSh//fevD/y5PxMf/+frle3nwXp3zqAXLAxfVbhknaB/+V7qR61z+4Jofxx+WA4BdoL9hzAhv7YMX6c/pM5BJkLgr1T7/f//zRf/ggf+Yz/xi/0ufgjv8nfl8f53n+TvH3//euB/sg/40k//3rgf7IP+M+DOqMFU+gBGrBj/77/7+Q/5cn4xf//LZ/5KGbz4L5z57/LBOE+eAH/5Dfp//rD/tBOApQv+JLmfhFyrCdfoyEdMVD//gOLr/mi/jt///VYThPP+h1vX1/+Gu3YAA//+XOt//N+f/N79VGwfp54FHguwATT1l3//Q9J/6ABPMaf/6w/7QTgsVt/iS5n4SYECAbIIYcVD/++9eH/lyfiY//8/XK9vPgvTvnUAuWDD/6OmRfg1///hKP/DwfnvP/T/77pe3+/AOBO0D/8r3Uj1rn9wTQ/jUAcAshl281CZO3sQucXf/7xv/+w/d/x3HH4MaXn/6w0nf+qZ+MX//9LIUE/bOg/sfXuAOIgNkBwAtGq3//Sr/+6+8///lg3/iFC6bj1n+R+s0+1///odf9Dr/5s/89///+8uuD78C6j8Bx3t/n0m7Jj+ymhe//J8zqPMJ6uUVPb/P/zsQbJAS6Xt8B3Q4dCdUPynESf+P/XP+ZJxKP6vkV2HmxhWaIDt6zyOJ5cTP//f//qf+wrt//5IH/wPB1JWv3EpbUQcAxPlhgOSDFbrf43ViCmM8KnP7/8nzOo8wnrE7b7f57gDiICXS0+hnCqrAAnmsC//+h0rcRP+f////eU2BmX8CuT8Bx3W/n0rNABwIlqt//0fv/dfef//ywb/xChdNx6z/I/OoBcdKf//+h1/0Ov/mz/z3///7y64PvwLqPwHHe3+fSbsmeuXIfZ7/8nzOo8wnq5RU9v89wQbJALkQH/9FvEriJc+i3+ieBUMUMUMUSEkMUx+Jf//9///80X+Jj+WYf+Su/8Gv6XPl8f5//kGTc//9ESH/0Dd//6IkP/oGAZ//unf6PSd/Br/TrQTgzZwgzf+P/o8r8+D/nwTt2SRNH8QYE94gEdz61//L+MsGmQhXtbZO6WpupzcZ2z0ky2ffKCPdbuI+ypzcZ2r8F/oLVz8T560Kns0JP/pjjZfJt/Jt//+2mY3B1bsflJC56qTygQ9w///3UEy/+w6///GMVJFn//dwzL/7IP//8dxNrlafU0Qa9Ref//dwzL/7Dr//8dxseUDXIL//u4Zl/9h1//+O4lEtP//7QTz7xWjP//+f3PI2RUP59odX+x1j9kH7C1p8nT1Z+H9hy//964H+w6/jNkqcm8pE0fxEpm1yePwShcxAxy/dhFTWdDpp/5u9f74z498b97ZXGL1UmLNm/72YlT1Sy7//vG4vtj/7Dr//8e/qWif//85j/ng+eDzl0vg85jng84dZ9hF+Zz//7Dr/2Qf57/96//Pf/vX/YB9o/3/+T+f/f8ijjef/743+wLz/x4rgD4auiqv/3g6BdQ+zsvTs7GpPB//mgv9ph7TDmfKnaZoLaYcyznFgZ+YP//7Dr7R+Z371/+f//ev+0f7R9Xc/md3/Jo43n/+9M/sC8/8fG3/96Z/YF5/48eVeGe9A65v/+zTqMeqz/MJ6uYLzucD3BXMz/+Ggjp3wf6SbnMv4F1H4DMut/P/5YBxAB6TxEHAGOJt//9jxQExxDFMfsePsZChihihihihihihimPxMf//hr/80X+MX+WYf8ND/hr/S58vj/P/8NCbn//oiQ/+gbv//REh/9A3f/+iJD/6BowgX//ttP3j/+xxrtGxbq6icm+vD1lfnYwHTCBf0Gc6kAt/r2f8d8wrk8wcd7f4ygHjGoXL/+xHIA14Hyxf2PH2GVQxWZD5WZQxWZWZTH4ub//wa/+XJ/GL/MBP+QZ/wa/md+d5/md+QZFz//0H4f/RPn//Qfh/9E+f/9B+H/0TKpeJ/X/+r///SmXI/2QYDIYdhXfAe3+OPpagYAo3O//6oz/Vk+rJ6l6v/9UZ1ZPUoH5D//3xv9gXn/j42//vjf7AvP/HiucfoHKxa26iZAF//POKv0zHvoM1g23nGYN5xtNc10Dg2nDxPzYUND/p77T/pW7f/tr/wqB1JWv3EB//OxAJcl5p0nd//2adRj1Wf5hPVzBeePnYPcE80vPxr5H/sM8f/+BD/8D6U3nyiUMw+IF0ICDn3i3l27JImj+IlMtKnE5uUEe63cSElOZ///L0/5Yv/1Hr//uJH+6Cv/2p+NPfp54FHY8IoAKB9f7AmP+x49jIUx8THxDFDFMdjIUMUMUMUMUx+Jj//80X/4Vn/lyf8Yv9Ln4Wb/E753n+Xx/idzvP/+iF9/6CEP/+iF9/6CEP/+iF9/6Ao/X1FvAL/7hN+v8BfpnS2ysiwsBXtf2Xr6brZK9r+zj8prgo+gZ5W+6B5DosT0H/j0ZaLWX/dSxf+BVzro9k/+LP6H9XR8vrXA4NSAlDSY8gv/+af/zIP/p2H//aqP9tu//sKQA4BZav6T8ZZRxxEYB/9VDs/P9vTk5xZK9r+zfxPUo7tlbOJ6q6/V///QYJ/6Hpx+D/f1PQf+OzPB0p/3UsX/gVc66PZP/j1sqpQz1+nngUdjwigAVl4P7lZt86f7iH3HVcit81/d9//+bj/8Kz/y5P+Jj+f/8LN/id87z/L4/xO5+//73yP9h1/H0n/+98j/Ydfx9J//vfI/2HX8fOoL9zevJ0Y/jQvyH9epy9fTdaPlADlAB6/oXKK74TqaU///9Dr/odf/Nn/nv///3l1wffgXUfgOO9v8+k/5JRef+P6d//1Bh/nv///3MY8cAYQpmXzB//44/TofDDQk/8f+uf8yTiUf1fIrsPNjCs0QEgW01tjJ1Q+zf3wYM1k//3Fu8DM57028y9gdhwTr0coNfsr/9fh/xr5/7ylf/eB/dY4CfQuggEgkEfHP/98b/YqZ/4+Nv/743+xUz/x8bf/3xv9ipn/j6f//Ydf+yD/P//v//5//96/7APtH+//7/zO+/kUcsv//euB/sg/40k//3rgf7IP+NJP/964H+yD/jQdwIf/9//9T/2Fdv//JA/+B4OpK1+4lLIiDgC8/+qg1/7r0qfS814YWm3DWjeOS6cvu29KTXN4wOaTu5qWXf/9IN48Cj89///+/OiDjvmF1HmDMvb/HcAcRAS6mZL/iDCfll//C///cxf/jX/ix9NbYf+1EhvIX/xH/qEf/z8/CK/0waaR847reABxABCBanI/76n/zb3///5ex/4sg7W3mEV65L6agDgFU+jL//pB/9IP/9kn8////+/JkPDzCuTzBmXW/jgQsXPxHHf5UBO/Jt//+2iAjjw0u0HSfnj9Kc0N/u/BlgN/94H91jgJBAJBAJBII+r//sOvxD5nfv//5//96/7APtHYvf+Z338ijn7//vXA/2Qf8aSf/71wP9kH/Gkn/+9cD/ZB/xovnwAARTET//+h1/0Ov/mz/z3///7y64PvwLqPwHHe3+fSf8qAPkE2wCbeUpakSpgDJRKVlKzfQSCAR9B//2Af+w6/P//v/8zIvtH+wD71/v/M775bRzvP/97a/YqZ/4zsA6dItiApWrLv3v/0g//miU/+sVV95hdR5g47rfxs1QyKhf/+9tf/2H7v+MYc7Uah/tfwf/5L7mneft35yS9JYv/7vL//w1/+bj/Ex/LMP+Gh/w1/n/+Xx/n/+GhO8//3xv9gXn/j42//vjf7AvP/Hxt//fG/2Bef+Pn+Q4Yr8a95SukJkAaCO39BAJBAJ9wrnqL/7AP/Ydfn//3/6dUvtH+wD71/v/M775bRzvP/97a/YqZ/40Nv/721+xUz/xobf/3tr9ipn/jM3pSHwGaQmRhoJBIIBAIBIJ4w//7R/0/5nfvX8zjftH+0fV3P5nd/yaOOf///MP//96gmX/2HX//5FidSJo/iG1RDN//e2v/7FJ/8RD/xjHZs2lD//91BMv/sg///xjFr8hwsX+v4FieYv9fHbx4K9coV2O9v8f/kF/b//9rD7TwO7////PbBzFxqAOAXK0TDb5dCKKKADYqc3Gdu6D/SO/yv/03//v/7gf5D99h1//+LHzL9BxTPHqqBcB7g4/DqC/QExYdpoZfB4Xe7AkSElbOc39/j//4Nf/NF/jF/mAn/IM/4Nf0ufO8/zO/IMjef/721+xUz/xobf/3tr9ipn/jRhtO//9MYf8nnQfPf///xwz7+QHHdYURB4y4avE/r//V///oYhA/7Hw/YYdhXY77f4//LEAcMeZ///dQTL/7IP//8YxZMwL+gznUgFv9ez/jvmFcnmDjvb/HcAcRALX//fG/X/e2///721723m//700+//73yP9h1/H0n/+98j/Ydfx9J//vfI/2HX8fTw//97a/YqZ/40Nv/721+xUz/xobf/3tr9ipn/jSf/3xv/3tr9jWf7Dr+QK/8ZkIt//21838g/bsftn17OZUz29PrzaePrt///oPw/+iVv//Qfh/9Erf/+g/D/6JW//6vT/vjf7Dr9zZf+54/60/8iv8RM/xi/tqMekz3tff8n//Zp1GPVZ/mE9XMF5pWrLv1d/3jf/9gS+9/kI/x3FSzhf6uVvBnW/0k3OZfwLqPwGZdb+aVo0P+nvtP+lbt//wY/+FQOpK1+4gP/52IB0SF///qD+9lz8fn////5CGk+HzMvbz+qaLZC5Wvo3sUKsR+94qfT77ZkqnHG5To9WEwBwA5ey+6v//Q9J/6ABUtIb/9W7f/mM/jF///SSX/4HgrX5XznxOtb4P/+af/zIP/p2H//aqP9tu//sLfzMVDxlkx27p9nPHEgHU/XA4AVDVb998S///zmP/8UF/8s1Hq+GNr85SoeMvGdB/47M8HSn/dSxf+BVzro9k/+H5EQ/6/TpIlAfp54FHguwATr0h3//Q9J/6AB7eQWC9A5ZDZCex4RRAPmBP4aXcdjtN9AF9TGf76n+vKH2SX//q9P+rQv+pq/+5bf7r/21H+2LV3n//Qd+/9EZeo0/XzsDxhdNTkPnrk2f/O///9et/yksK8YY5vT/7ulP2DcaBovNfmi/Nx+a/MzmvzM5mc1+ZnNfmi/mhcP//oO/f+iUhWfMX+2wduPxopYXsyO2fXss1TPcP/aD//9Xp/1aF/1NX/3Lb/df+2o/2xau8//6Dv3/omw//6Dv3/omw//6Dv3/ojK/9zu+P5GR+3fnHN01V3e7y//zcf/ggf+XJ/xi/z//gjv8nfnef5fH+TvLciSf//UI/41RIB6ezMRgwXHudygAH//y51v/5vz/5vfqv/LA9wWTWgf/H97fVETsytXno70gH7qJz/hr/es+hb5gcAnfCnY9s/24Od/DX///EDV/Gk3Rof/X/466Cf/7436/74zPT/++M9tR5Q//+g79/6JsP/+g79/6JJlTf5DKudS97VObjO2ejX5CPpS8yt2SRNH8RKZMoAcoANPyGVc6l78+HsuZkDv2t5Wf4a3atWXf/943F9sf/Ydf//j39SCJf/7tv+j0nfwa/060E4M2cIM3/juCAcILmCd87A4AXTHt8dxeuRNP//9vj1upCvNL8Du5EwDiADhpX97+f+8BZvP/+flHvIeFDflHpR+Ue/+esIf/+9tfsC8/8aT//7IP8Q+Z371/+f//f/+wD7AGLc/md38so4hVLLv/+kG8eBR+e////fnRBx3zC6jzBmXt/juAOIgNv2f8OG6Kyf/6u3elUP/64eVrSAwlwmuuso0f///uJ///Q6/6HX/zZ/57///95dcH34F1H4Djvb/PpBIlytEHDgQ//7//6n/sK7f/+SB/8DwdSVr9xKTcGAkVUB+Xv+mN/9RzoCL/W6JbjgmXs8flgHEQHTFef+P6d//1BAzvz3///7mMeOAMIUzL5g//8bfsrssV8ZvoqJZ///z4V65R6wzfNb3dMA4iAvfNd9z5onL8qAnfk2///bRARx4aXaDpPzTEVf/98b//sP3f8dxUtLz/9YaTv/VM/GL//+lkKCftnQf2Pr/87AcRAVLWgf/mXT/cN2+gf//bJe3ED/iE+rPQfv3BhskBMMXPmicvyoCd+Tb//9tEBHHhpdoOk/M60JP/H/rn/Mk4lH9XyK7DzYwrNEA+E/6B/+Ae/5+Ue/8//5+UelH5R6UelH5R6UflHv/nvL//2Qf/sOvz3/71/+e//f/+0f7APvX8n8/+/ltHFj8sE3X3P9xCf8nInfhr/2gJlx22PWaX/zqhqil1ey85xYMMHpbf55wTfWd8//9h1+IfM79///P//vX/YB9o7F7/zO+/kUc8DUu0AHJHWn/zLYfqh7fQP//tkvbiB/xCfVnoP32/TLE717RAckGK23XMcRaMQEHU/tDvY2unfr8fYWLQ2ms+DI/sUarvxu//vKH7JuP/GcRLKzMGfUpX1+f/9IP/pB//sk/n////35Mh4eYVyeYMy638f/oqL+hcor5tCgj3W7iPpJvRUjPR//71BMv/sOv//xjFS0vP//u4Zl/9h1//+O4lVX7//6Yw/5POg+e////jhn38gOO6vL8hH0p91o0P//dQTL/7IP//8Yxt+lNaTu4QL/+4f7bT2Z79kH//+IT474exIfeccYMIHAFvd/tDpV2O0/sg/YWLPHWvD/bfsV7//71wP9h1/Gh300LZO//6hCPxXPx+f////kIaT4fMy9v78i+94BwAoSPukiof//uoJl/9kH//+MY//AzHb//9lP7TwHjT///PbBzFxRKCT/6Y42Xybfybf//roK0g6t2PsY47q+cmlGEACAS4zAp1zLX66TTL//vOW/2HX8d9p+n//9oJ594rRn///P7nkbJL+aUST/9sb4T5Ffyr///ssdXp6Jx4n7oo8gv/+7hmX/2HX//47jb+sbLLlQEgD3PvFBEk8K0E3tpef+nt///H0+o0///AkcvQaHRLk/Ae3+JdPC/5XCOrWt/p34XmE/9j1cwe3+f/0PMfIDo+cSnu/53g3nwb/2XU6jzBju4P4h/88anGJmB4x7wgX//ttP3j/+xxrtGxbq6icm+vD1kAYCTGgmMetWzn6Aa4ALpYPg18Ko42o1vYzrWHy47DI/+F/mfzO/evp2k+0f7R9Xc/md3/Jo4+//73yP9h1/HtYwUQHJFef+xn7x/ibH//4z//EMYH/ozip48c/K/kN61g3gAf/Y3U3vn/+8b//r9nf8dxQsz/+Ggjp3wf6SbnMv4F1H4DMut/O5wHALVo0P+nvtP+lbt//wY/+FQOpK1+4gP/52IB6cMAFsgYSuLc086AE21zOf/921//Yfu/4xifZgX9BnOpALf69n/HfMK5PMHHe3+NQB4y1aXn/m959/sM8f/8Z//gfSm8+USg1Zo//11n/W7N4H1uzvA/vAWIj5Dv+8y/KPf/Pe0P//e2v2Kmf+NJ//hf3T8//3r/5xv2AfaOxbn8/+/5FHET//vfI/2Qf8eno8zn//dtf/2H7v+MYkAOkIJkEBJqLz/ze8+/2GeP/7F/4H0pvPlEoogwFoiHhDCKwsMRASicC//9tp+8f/2ONdo2LdXUTk314esKNqA9wZkWm/8T/mP91w///gx/8Wnpfz4LqAcAOHy0aXn/m959/sXkev/+TbPL86B5cp//rqAQLAtwDiIAmWl5/5veff7DPH//Gf/4H0pvPlEofbUpNcbf/z7/31x/zGfxMf//pLV/8pLK1+V6d8f/R9xiAmmd3/1sQKyq//Zpz6cwt71auxn/Prikf/e0AAf//LnW//m/P/m9+q96XEx7dsFiggigAmnpDv/+h6T/0ACeaXn/6t2//MZ/GL//+kkv/wPBWvyvnPjUBcwWrW+D//mn/8yD/6dh//2qj/bbv/7C381vOwOAF6x7f78A4E7QP/yvdSPWuf3BND+NQBwCraEn//pjf8U7cpfDJfGHahlID5YYCOAAH//zFtv/50r/50XpULfRoNkxfVbhknaB/+V7qR61z+4JofwdvlgOAXLO7/62IFZOH/Zpz6cwt72IXnt/n/9GQiSSuX+P3kEWjABNuNv/59/764/5jP4mP//0lq/+Ulla/K9O+PVe0QE0zoP/Hoy0Wsv+6li/8CrnXR7J/8f/of1S4AA//+Ytt//Olf/Oi9LHCUXy4UH/J1HVOeOJNwgJRRDf//UI/41RIB6fX+IwT58qffSCETTHt/v96ZJ2gf/le6ketdKmM+7/GoA4BQNGh/9968P/Lk/Ex//5+uV7efBenfPfy180gAD//5c63/835/83v0443jrT/k/XPwm9voFq9CG9IB+6jKh+/H8vEweMxnFUgMsP/o6ZF+DX//+Eo/8PB+e8/9JtkxfVbhknaB/+V7qR61z+4JofxqAOAcvnwOsx1vA9B+VTjjcp0eq2Wc9LLw1Zd//3jcX2x/9h1//+Pf1IJJc/z2H/R6Tv4Nf6daCcGbOEGb/x//yBzG33//odK3ET/n////3lNgZl/Ark/Acd1v5//Q0DABwMciT9PozQfROpBL2+O4vXImn//+3x63UhXml+B3ciYBxABIJaf/77+OL1v//X75nrxaSAgzv01AHjHH9W1/xSx7fHcXrkTT///b49bqQrzS/A7uNGAcQAcj/b3PEJdICgat9//6HStxE/5////95TYGZfwK5PwHHdb+fSs0AHXeWq3//R+/9195///LBv/EKF02/An+R+Zwir//vjf/9h+7/juOPwa1mS/4gmf4M//wv//3MX/41/4sfTW/D7emoWgBLkv8hy/+Hgnfyr///uaVEzMDNlQuT44+p1m2//97a//r9nf8YxLJaf/77+OKjP//X8DYdpICDO/TuAOIAOHgPGFQwuXIfZ7/8nzOozMPWJ232/zKKa0/+ZbD9UPb6B//9sl7cQP+IT6s9B+/fyuUYCA5IMVtuuY4i0YgCeM8KnP7/8nzOozMPWJ232/zKJaf/77+OKjP//X8DYdpICDO/T0rNAB2uB4w2KnHG5Te+QyrnUvcdu/JuX9C5RXbCbtub//3cMy/+yD///HcTa5UBIAerKm+D//u4Zl/9h1//+O4nWhJ//4sP+l2Vm///pprUgoFuJE6cZ//3uGZf/ZB///juKv3wCAmt9fstxVqqcgv/+7hmX/2HX//47jWKz//qjP9Tof/9WT9WT9UZ1KCdf/+qNPP//3rgf7Dr+NJP/964H+w6/jP/zToI91uttEGFi//yP/baezPfsg///xCfHfD2JD7zji7gTboTH//0OoQP/QAKUqdf0TW+v2WbQR7rdxH5W8GN4n73/7xv/+wJfe/4Qf47ieZwv9XK3gzrf6SbnMv4F1H4DMut/O5wHAKpo0P+nvtP+lbt//wY/+FQOpK1+4gP/52IB0cJRPC/5XXfdToP9O/CzMP/Y9Uy+3+eADAPJAQbJAdH/3vf8T/mP91w///gx/8WncrX/khBC/yr87AcRAdLIf/w5/1Q9i/2LyPX//Jtnl+dA8uU//1NMCBYFuAcRAEyDpCCZBATTS8/Gvkf+wzx//4EP/wPpTefKJRX+RiVzujCSv//RC5N5x+B6xXewviUUsu/e//eN//2BL73/CD/Hcf/I9PC/1creDOt/pJucy/gXUfgMy6387nAcAqmlD/6e+0/6Vu3//Bj/4VA6krX7iA+QQCXQRkiJZAAmmrxP3v/3jf/9gS+9/wg/x3E8jYJLf/oSPMXRTnaMUsMkYrfLecZg3nGYN5xtdcxInqAAF/9N//9wP/v//2E4Od831WnMsvl9Bvk+WEA6YYX/K4R5/an/p34WZh/7Hq5g9v87HxD8sIByQ3f87wb0GB/8pYdR5gyRh6uIf/J1cBwDgAcA8EP/zmP+djv/nMfng/nMc6/rHhF84brn8zj//euB/sOv4zw//2HX/sg/z3/71/+e//ev+wD7R/v/8n8/+/5FHCjat9/V3/Q6//aO0/0xUMn4Fcn4DMvb/PpOQHADmOk4Mqc/IR9KXm1mIJvSgBygA0/IZVzpaMVQCOdzH1+r//+gwT/0PTj8GA+lYGhogATTW+D//mn/8yD/6dh//2qj/bbv/7C381vOwOAFox207ZDmMKKICaeoi//6DBP/Q9OPwY0of/8Bxdf80X8dv//6rCewZvPgvTvr3AHEAHRzsDxg17cqnrWCz8A3SPC70mgf/+Av1Z36v/2rHkWFgK9r+y9fTdbJXtf2cflNcFH0DPJP///Hj/+sP++uP+Yz+Jj//9Jav/lJZWvyvTvj1NdNflHAFn/1BMfUadTfK2c5EEBS/d7//+bj/8Kz/y5P+Jj+f/8LN/id87z/L4/xO5+//73yP9h1/H0n/+98j/Ydfx7wvpSh8gi0YAJNfdX//oek/9AAqGTF/lB/hdL///uM9Ppat/3i34+vHybpTmf//y9P+WL/9R6//7iR/ugr/9qfi7Rw+dsgQ39sEx9Hn0YCgIvdwQEp91x//5uP/wQP/Lk/4xf5//wR3+TvzvP8vj/J3m5//3vkf7IP+PcP/975H+yD/j1o/kCYoCz/6gmPjF+IYq2c5EEBS/d9//+9cD/ZB/xpJ//mi//Cs/8uT/jF/pc/Czf4nfO8/y+P8TuXyAAf//LnW//m/P/m9+rP9M0yxfuNpiJ1z//fGAr3Z8U/z/zx87B7gq3sOv/+gwT/0PSXUab/+Q6D//NF/Hb//69GwZvPgvTvr/87AcQAcgDxhVgAH//y51v/5vz/5vfqvfTIMLlp5HguwAUSK62OVCT/4H9b/6khDYf1vcTYOpt/OxgKJrMl/xBhPyy//hf//uYv/xr/xY+mt+H27gDiADo4T6JVib//78n5H/pY8f/+UF/8KqU3nyiAjPqmg8ZVMe3wEkBxgAvGp+HZVLpf/rT+rOq4oBtuHOUW+eN//7Dr8Q+Z37//+f//ev+wD7R2L3/md9/Io5+//71wP9kH/Gkn/+9cD/ZB/xoQ4nAAS6an+3wHVEonUooJP+4fm//MTibH9X68dOw817PkOK8/8fxx//UGH+e////cxjxwBhCmZfMH//jY+9y//+tMP0VEs///58K9co9YZvmt7umAcRAS6Xb/+sPbRGH//6WegKYwN04s7k/X1XtAB6ev0HjDt8TGbkMwaA2ACbKX//721//X7O/4xieaXn/j+OP/6gw/z3///7mMaX/wPBhCmZfMH//jUAuWDFyYj+BhLP//+fCvXKPWGb5re7v/g8HEQEil2//rD20Xv//+lnoCmMDdOLO5P1/+dgOIANkB4w7fCzGn62ggMAJxi5/uCj/JyJ34a/9oCZcaXdcaX/zWNv3xJdG7O9/+T5nUeYT1idt9v89wBxEBLpafQzhVVgATT6/P/+kH/0g//2Sfz////78mQ8PMK5PMGZdb+P/0WX9ZPlUFcrT6miDR7MdbskiaP4hmXMS7EZduQQC3qwk3N//7uGZf/ZB///juP/v1ub//3cMy/+yD///Hcf/b1ml6Zjz1E//+grCB/6Hp/+AlOQX//dwzL/7Dr//8dxNlM//91BMv/sOv//xjE2kTR/ESmdZnwz8ZvunRoJk7DQSCQSCfqv/nj+pfUB9S+oD6d6GD//9BWED/0PT/73qkD//tCEfiufj8/////IQ0nw+Zl7f340BbIFW1yC//7uGZf/Ydf//juJpoSf/+LD/pdlZv//6acOkvYEcPk3om4ToBS339Xf9Dr/9o7T/TFQyfgVyfgMy9v8+k5AcAOZizAv57Liyf/9e1PPmFcnmDjvb/GoA8ZVNKH/2Mt3/9E/1TP//4S4hwv52KdR5g//8//SDlTTM/4YctuNe//+y/lXMv4F1H4DMut/P/5YBxAB6TT2UzKDgqqwzqaaUP/sZbv/6J/qmf//wlxDhfzsU6jzB//5/+kHK6OyIBoCgBICkasu/e//SD/+aJT/6xVX3mF1HmDjut/HZwHjLhmf/w0EdO+D/STc5l/Auo/AZl1v5//LAOIAO1wOAFrilFD/7t/iP7rh///Bj/4tO5Wv3EMX52A4iA6OdgcAO3uean0DkgIodswjAP/9KZ5+3YJMb9dL5ZnS+Y3BtIhzSWj6gLLYrz/ze8+/2GeP/+M//wPpTefKJQuY3ifvf/q///0MQgf9j44cMOwrsd9v8dwQDuCAe1giZVf9sgtv6SOaCZIBoJBIJBPtcPtODWDp1g1TltGRIn+QSltx0P6SbnMv4F1H4DMut/PcAcQAbIDgBZNKH/3b/Ef3XD//+DH/xael/Pgxfoz2A4AWTS8/83vPv9i8j1//ybZ5fnQVC//17gDiIDZAcAKZnd/zvBuyA//lLDqPMGO6t3iH/z3+05B4Qq2rff1d/0Ov/2jtP9MVDJ+BXJ+AzL2/zqAOAdD/fF0L//C/fw/fD94X7jF+IYsXhfsP3hShZlDFDFi/iYf//fyf/Nx/iY/lmH/lMv/DX+f/5fH+f/4aE7z//fG/2Bef+PQ/yGf6pBXi//7NOox6rQCvPVzBecoB4ySn3O3hFTr+hcor5tGzO0Jg//9D0n/oAE80vP/59zQf83H8iv//6TV/OS/9PTtfp//We0Qx2Q/L61sEerq3/vv/v5D/lyfjF//8tn/koZvPgvnPn0rNABsghjH2O+D//mn/8yD/6dh//2qj/bbv/7C381vOwOAFjWGuQX//NP/5kH/07D//tVH+23f/2FSAcAq2syX9V7KfBn/+F6vn479s37Tr3/7VPkOSbxFewTTJg/5nO2/hr///gaBfanlkbf/WiTfBi/cbTETrn/++MBXuz4p/n/nKA9wWP/8Of/bm0H/zGfxi///pJL71K1+V858f/MgFzAWTC4lQLhiACeZMH/M5238Nf//8QNX8aTdGh/9f/kSkuXOmPBdgAmkxsf/+/Oe+05Gf/77Tf4f//RC+/9BCH//RC+/9BCH//RC+/9BCH//RC+/9ATfv7GfVzPdmJ2X/2rHYQXN77nfoFJ+OOoL9gTFAq/lKVMfGL8QxWZQxpSoYrMoYoYsX8RqmUzhKn//NF/+/1P/Lk/4mP6XPwR3/Lk/O8/y+P8neRPtOn/+rsov/m4/kV///Sav5yX7h2v0//QwgDgBzJGWL/n//gl8f//tZcx97ff53Wc+nH3HaG/yr1r7k7vH7d7uSdz08SX7vz//zRf/v9T/y5P+Jj+lz8Ed/ybfnef5fH+TvO8//6IX3/oChOP3N68nRj+NCuof16nL19N1pLJu39C5RXgCdK0JP/H/rn/Mk4lH9XyK7DzYwrNEBNNYm//9r/L/FCfoef//vzog48Fe6kK6Ze3+P/0Zyujplh4QLJqoj/x23/m33X//+UHP+LIO1t5hFtV8agHuDj8O3J0zc3sZThV6ZgVkSxQq5Bbfz9gCH//vjf7FTP/Hxt//fG/2Kmf+Pjb/++N/sVM/8eTv/3vf3Hm9//U6r+f////bJgzf+FQPH847+A9v86gI5NLJ//9433tuRn/97bf4f/++N/sVM/8fG3/98b/YqZ/4+Nv/743+xUz/x8bf/3xv9ipn/jv2xb//tr2X53+3Y/bPqdcyMpz6gCG0ufZp//+r0/721+w6/dNn/ueP+tP/Hb/FtP8TH7ajE1//0H4f/RPn//Qfh/9E+f/9B+H/0Tv8fP0//338cVGf/+v3zPXi0kBBnfodvOwPGLtBgSASLAM87uczRof6rzW//qdV/P////tkwhj08fzjv4D2/zGRehf/7tr/+v2d/xjE8D3OZgyyABNOJn//v//1P/YV2//8kD/4Hg6krX7iUv/ywwHDwHACyY7f/1h7aIw///Sz0DfA6cWdyfr6p+EXMBc8NKBo/2ss6IY5/2tktT1eZ3//2Afp/z//ev/mRfaP9gGrufz/7+W0cbz//fG/2Kmf+Pjb/++N/sVM/8fG3/98b/YqZ/48VZL39tf9Mb/6jnQEX+dcyEQGZe0nLtEB0cJQl/kOX/w8E7+Vf//9zSomZgZsqFyfHYeKX//721//X7O/4xiXJZWZg0BsAE0+1///odf9Dr/5s/89///+8uuD78C6j8Bx3t/n0n/KgD5BNsAm3lKWpEqYAyUSlZSs30EggEfQf/9gH/sOvz//7//MyL7R/sA+9f7/zO++W0c7z//e2v2Kmf+NHjxjpIfAP/r9Wayf//6oHlb7oHlb7oHlbwNh/uLnzVQJ81UCfNVEno//96gmX/2HX//4xhwx5Av/+8b//r9nf8dxyQwv9XK3gzrf6SbnMv4F1H4DMut/PP/J//9yn9p4Hd////ntg5i46QL/nUF1ey85xYMMHpbf56iNBvZmE7DjrH//YB/7Dr8//+//zMi+0f7APvX+/8zvvltHOzb5C+0vH//vjf/9fs7/juKFnC/1creDOt/pJucy/gXUfgMy6380rSh/9Pfaf9K3b//gx/8KgdSVr9xAfIIBUsLmaC66v/+zTqMeqz/MJ6uYLzStb3z//eN//1+zv+O43I74P/+7hmX/2HX//47iyZn/9nyLq1rf6d+FmYf+x6uYPb/P/4/4f/AOQyHwE//Wyfv6Hl//VA8rfdA8rfdA8reBsP+xl8dE2fHRAY8gX//eN//1+zv+O43I2Xf/943F9sf/Ydf//j39SyZwv+V13xDSP6d+FmYf+x6uYPb/PcEA3KGD//9BWED/0PSyaUP/u3+I/uuH//8GP/i09L+fBMu754r8a922ukJkAaCO39BAJBAJ+i//7AP/Ydfn//3/+ZkX2j/YB96/3/md98to53n/+9tfsVM/8aG3/97a/YqZ/40Nv/721+xUz/xo///LLbxFRls90ipgDAQCASCQSCAR7B//2AfiHz//f//mRfYB9gDF7/z/++WUcls2ZKdnCDvANvW/+FimnKn7A8IfzVQJ81UEsxtBHut3Ef5QR7rdxIBW6cBwA5ey+6v//Q9J/6ABWtIb/9W7f/mM/jF///SSX/4HgrX5Xznw5fGvSIQpKLM26YWq3774l///nMf/4oL/5ZqPV8MbX6k61pY31sZCMBwDofNVv33xL///OY//xQX/yzUes+GL/JOhAMvUOANeBg/5nO2/hr///iBq/jSbo0P/rmge4LJjTzwKOx4RQATrQk//9Mb/inblL4Xp4w7PEF0m9lcHSEGhlUgNv1TQcALFj2z/bg538Nf//8QNX8aTdGh/9f/k0xp54FHY8IoAJ1oSf/+mN/xTtyl8Ml8YdniC6ZhgNYCQoHSEGhYs0BwCyZMH/M5238Nf//8QNX8aTdGh/9c0BwAz/DWgf+N9O/Cb2+gWr0Ib0gH7qMqH7+o3t81ellT5s8eQX//NP/5kH/07D//tVH+23f/2EnZMX1W4ZJ2gf/le6ketc/uCaH8YSgBygBVDvkMq51L27U5uM7Z6P0iVOBZIfLAm5f0LlFd4JxTxX/80F/tBHaYc7874PNBbQRnX9Y8Ivz8v//YdfiHzO/f//z//71/2AfaOxe/8zvv5FHO8//3tr9gXn/jQ2//vbX7AvP/GY9qfq/lf2Osfsg/Y6rum6ermbfsNMP//e2v2Bef+M3wLmCawMVBkXLeC+htohWzHX+X1//7IP9P+f/71/+e//f/+0f7ANXc/n/38to4sQDiIDkjmS/4gwn5Zp3ff//uYv/xr/xY+mt+H2rgO6AByPXPaNv/h4J38q///7mlRMzAzZULk+KlwIf/9//9T/2Fdv//JA/+B4OpK1+4lLkGAoWLn4jjv8qAnfk2///bRARx4dtjS8h8zxFX//fG//7D93/HcUjVl3//SDePAo/Pf///vzog475hdR5gzL2/x3AHEQDu/71+DPIz/9XT5wA3jPSGWnFmNmUav93G0Jrq4DgFgyfgHv4B7/n5R//z//npR6UelHpR+UflH5R6Ue/+frf//Ydf+w6/Pf/v//57/96/7R/tH+9f7/z/+/k0c2tcNVv/+j9/7r7z//+WDf+IULpt+BP8j85oDgETPt1vCKoRVfnf9C5RXzatBHut3EfUoBHO5lhyEBysHGy7//vG4vtj/7Dr//8e/qP+E57feTV//iXxLvjS/3xv3tjuYbNyaM2K/vfUbmYHACl9nYR8OH//+6gmX/2HX//4ximVV+hF9ZIr1E//+grCB/6Hp/+APkMq51L4ec5Ll2Grk8+Qj6UvLKpPG339Xf9Dr/9o7T/TFQyfgVyfgMy9v8+kxAcAKppeP//fG//6/Z3/HccjgvRoIMoEA2t586Z28RLnpYemrHLMrMoYokJLMsX8QbbMlO2L//DX/5uP8TH8sw/4aH/DX+Tvy+P8//w0JZf//REh/9A8ediAckV5/5veff7F5Hr//k2zy/OgeXKf/6nbzsECwONfvlgHEQBMtW+/q7/odf/tHaf6YqGT8CuT8BmXt/n0nIDgBke/Cc//hoI6d8H+km5zL+BdR+AzLrfz/+WAcQAelE1DgDLpq8T97/9X//+hiED/sfHDhh2Fdjut/H/zsgaQAcinN+qWXfvf/pB//NEp/9Yqr7zC6jzBx3W/jg4Dxjp7WLs7v/rYgaJjf+zTn05hb3q1djP+f/nYgFvwarfvviX//+cx//igv/lmo9Z8MX+e4IBLpaf/6w/7QTgsVt/iS5n4SNqGh/9968P/Lk/Ex//5+rBm8+C9O+ePnYLrjW/ffE4r//OY//xQX/yzUer4Y2v1qQwH/3xAAH//y51v/5vz/5vfqs802OtP+T9c/Cb2+gWr0Ib0gH7qMqH7//R8v1TQeMMFrkF//zT/+ZB/9Ow//7VR/tt3/9hSAHAK1jt3T7OYwprMgJ5pef/rDSd/5jP4xf//0kl96la/K+c+NQFzBamdz/XDEJ1JqVERrt+tP/zv///Xrf8wJCu5zC39O4IBHKVv33xL///OY//xQX/yzUes+GL/W087EAlEu3bNUcBaMAGN6FE7MH6FCKCJJ4WTuKx3CTUEn/j/1z/mScSj+r5Fdh5sYVmiAqDNyOKIehf/7tr/+v2d/xjFQm+OtP/mWw/VD2+gf//bJe3ED/iE+rO8v++x51+F2WK23XNWIuN+IKssWehf/7tr/+v2d/xjEsB7nMwZZAAkUzFaorxJJp///t8et1IV5pfgd3HL8sA4gAlEtPrK08vnWrEm8pE0fxEpmyCkmbE6fKmYRjBOvUvb/+qB5W+6B5Rgej/9WOUdE//5vEg8JtZ+AAAA==' };
const DONATE_ALIPAY = { type: 'image/jpeg', b64: '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' };

const APP_VER = '9.0.90';
const SESSION_TTL = 43200;      // 12 小时
const UA_NCM = 'NeteaseMusic/' + APP_VER + '.1734239895(8008090);Dalvik/2.1.0 (Linux; U; Android 14)';
const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* ---------- MD5 ---------- */
const MD5 = (() => {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  function toBytes(str) {
    return new TextEncoder().encode(str);
  }
  return function md5hex(input) {
    const msg = typeof input === 'string' ? toBytes(input) : input;
    const len = msg.length;
    const bitLen = len * 8;
    const withPad = ((len + 8) >> 6) + 1;
    const words = new Int32Array(withPad * 16);
    for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << ((i % 4) * 8);
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[withPad * 16 - 2] = bitLen | 0;
    words[withPad * 16 - 1] = Math.floor(bitLen / 4294967296);

    let a0 = 0x67452301, b0 = -271733879, c0 = -1732584194, d0 = 271733878;
    const M = new Int32Array(16);
    for (let chunk = 0; chunk < withPad; chunk++) {
      for (let i = 0; i < 16; i++) M[i] = words[chunk * 16 + i];
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const tmp = D;
        D = C; C = B;
        const sum = (A + F + K[i] + M[g]) | 0;
        B = (B + ((sum << s[i]) | (sum >>> (32 - s[i])))) | 0;
        A = tmp;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const hex = (n) => {
      let h = '';
      for (let i = 0; i < 4; i++) h += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
      return h;
    };
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  };
})();

/* ---------- AES-128-ECB（用 WebCrypto 的 AES-CBC 逐块模拟） ---------- */
let aesKeyCache = null;
async function aesEcbHex(plain, password = 'e82ckenh8dichen8') {
  if (!aesKeyCache) {
    aesKeyCache = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),
      { name: 'AES-CBC' }, false, ['encrypt']);
  }
  const data = new TextEncoder().encode(plain);
  // PKCS7 填充
  const padLen = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  padded.fill(padLen, data.length);
  const out = new Uint8Array(padded.length);
  const iv = new Uint8Array(16);
  for (let off = 0; off < padded.length; off += 16) {
    // WebCrypto 的 AES-CBC 一定会加 PKCS7 填充，所以 16 字节明文会得到 32 字节；取前 16 字节即 ECB 结果
    const block = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKeyCache, padded.subarray(off, off + 16));
    out.set(new Uint8Array(block).subarray(0, 16), off);
  }
  let hex = '';
  for (let i = 0; i < out.length; i++) hex += out[i].toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

/* ---------- 通用 HTTP ---------- */
async function httpText(url, { method = 'GET', headers = {}, body = null } = {}) {
  const res = await fetch(url, { method, headers, body, redirect: 'follow' });
  const text = await res.text();
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, text, setCookie, headers: res.headers };
}

function parseSetCookie(raw) {
  // Workers 的 set-cookie 可能被合并成一行，逐个拆
  const out = {};
  if (!raw) return out;
  const parts = raw.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  for (const part of parts) {
    const first = part.split(';')[0].trim();
    const i = first.indexOf('=');
    if (i > 0) out[first.slice(0, i).trim()] = first.slice(i + 1).trim();
  }
  return out;
}

function cookieStr(obj) {
  return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('; ');
}

/* ---------- 网易云 eapi ---------- */
function deviceCookie() {
  return {
    osver: '16.2', deviceId: 'ncmcf', os: 'iPhone OS', appver: APP_VER, versioncode: '140',
    mobilename: '', resolution: '1920x1080', channel: 'distribution', buildver: String(Math.floor(Date.now() / 1000)),
  };
}

async function eapiPayload(uri, data) {
  const text = JSON.stringify(data);
  const digest = MD5('nobody' + uri + 'use' + text + 'md5forencrypt');
  const raw = uri + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
  const hex = await aesEcbHex(raw);
  return 'params=' + encodeURIComponent(hex);
}

async function ncm(path, payload, session = {}) {
  const uri = '/api/' + path;
  const dev = deviceCookie();
  if (session.MUSIC_U) dev.MUSIC_U = session.MUSIC_U;
  if (session.__csrf) dev.__csrf = session.__csrf;
  dev.requestId = Date.now() + '_' + Math.floor(Math.random() * 9000 + 1000);
  payload.header = dev;
  payload.e_r = false;
  const body = await eapiPayload(uri, payload);
  const { text, setCookie } = await httpText('https://music.163.com/eapi/' + uri.slice(5), {
    method: 'POST',
    headers: {
      'User-Agent': UA_NCM,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://music.163.com/',
    },
    body,
  });
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('网易云返回了无法解析的内容'); }
  const cookies = parseSetCookie(setCookie);
  if (j.cookie) {
    for (const kv of String(j.cookie).split(';')) {
      const p = kv.split('=');
      if (p.length >= 2) cookies[p[0].trim()] = p.slice(1).join('=').trim();
    }
  }
  j.__cookie = cookies;
  return j;
}

function pickCookieObj(cookies) {
  const keep = ['MUSIC_U', '__csrf', 'NMTID'];
  const out = {};
  for (const k of keep) if (cookies && cookies[k]) out[k] = cookies[k];
  return out;
}

function pickLoginCookie(j) {
  const keep = ['MUSIC_U', '__csrf', 'NMTID', 'os', 'appver'];
  const out = {};
  for (const k of keep) if (j.__cookie && j.__cookie[k]) out[k] = j.__cookie[k];
  return out;
}

/* ---------- 网易云「网页版」扫码接口 ----------
 * 官网自己用的就是这两个接口；用它生成的 codekey，App 扫码时不会被判「设备环境异常」。
 * eapi（客户端接口）作为备用。
 */
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** 把 {k:v} 变成 Cookie 头 */
function cookieHeader(obj) {
  return Object.entries(obj || {}).map(([k, v]) => k + '=' + v).join('; ');
}

function mergeCookies(a, b) {
  return { ...(a || {}), ...(b || {}) };
}

async function webQrUnikey(cookieStr = '') {
  const { text, setCookie } = await httpText('https://music.163.com/api/login/qrcode/unikey?type=3', {
    headers: {
      'User-Agent': WEB_UA,
      Referer: 'https://music.163.com/',
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    },
  });
  const j = JSON.parse(text);
  return { unikey: j.unikey || '', cookies: parseSetCookie(setCookie) };
}

async function webQrCheck(key, cookieObj = {}) {
  const { text, setCookie } = await httpText(
    'https://music.163.com/api/login/qrcode/client/login?key=' + encodeURIComponent(key) + '&type=3',
    {
      headers: {
        'User-Agent': WEB_UA,
        Referer: 'https://music.163.com/',
        ...(Object.keys(cookieObj).length ? { Cookie: cookieHeader(cookieObj) } : {}),
      },
    });
  let j = {};
  try { j = JSON.parse(text); } catch (e) { }
  const cookies = mergeCookies(cookieObj, parseSetCookie(setCookie));
  if (j.cookie) {
    for (const kv of String(j.cookie).split(';')) {
      const i = kv.indexOf('=');
      if (i > 0) cookies[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  }
  return { code: Number(j.code || 0), message: j.message || '', cookies };
}

/** 用网页接口取账号资料（昵称 / 头像 / VIP），失败再用 eapi */
async function profile(session) {
  const ck = 'MUSIC_U=' + encodeURIComponent(session.MUSIC_U || '') +
    (session.__csrf ? '; __csrf=' + session.__csrf : '');
  try {
    const { text } = await httpText('https://music.163.com/api/nuser/account/get', {
      headers: { 'User-Agent': WEB_UA, Referer: 'https://music.163.com/', Cookie: ck },
    });
    const j = JSON.parse(text);
    const a = j.account || {};
    const p = j.profile || {};
    if (p.userId || a.id) {
      return {
        loggedIn: true,
        userId: String(p.userId || a.id || ''),
        nickname: p.nickname || a.userName || '用户',
        avatar: p.avatarUrl || '',
        vip: !!(a.vipType || p.vipType),
      };
    }
  } catch (e) { }
  try {
    const me = await loginStatus(session);
    if (me && me.loggedIn) return me;
  } catch (e) { }
  return null;
}

/* ---------- 会话：签名串（浏览器 localStorage 保存） ---------- */
const SESS_SECRET = 'ncm-worker-sess-v1-please-change-me';
async function hmac(data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SESS_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function b64e(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64d(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(s + '='.repeat((4 - s.length % 4) % 4))));
}

async function sealSess(data) {
  const body = b64e(JSON.stringify({ ...data, t: Math.floor(Date.now() / 1000) }));
  return body + '.' + await hmac(body);
}
async function openSess(blob) {
  if (!blob || !blob.includes('.')) return null;
  const [body, sig] = blob.split('.');
  if (await hmac(body) !== sig) return null;
  try {
    const data = JSON.parse(b64d(body));
    if (Math.floor(Date.now() / 1000) - (data.t || 0) > SESSION_TTL) return null;
    return data;
  } catch (e) { return null; }
}

/* ---------- 二维码 SVG ---------- */
function qrSvg(text, margin = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const total = n + 2 * margin;
  let cells = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!qr.isDark(y, x)) { x++; continue; }
      const start = x;
      while (x < n && qr.isDark(y, x)) x++;
      cells += `<rect x="${start + margin}" y="${y + margin}" width="${x - start}" height="1"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${total} ${total}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
}

/** 音乐 CDN 都支持 https，升级一下，避免 https 页面下载 http 资源被拦 */
function httpsify(u) {
  if (typeof u !== 'string') return u;
  return u.replace(/^http:\/\//, 'https://');
}

/* ---------- 网易云业务 ---------- */
async function loginStatus(session) {
  const j = await ncm('nuser/account/get', {}, session);
  const d = j.data || j;
  const p = d.profile || d.account || {};
  if (!p.userId) return { loggedIn: false };
  return {
    loggedIn: true, userId: String(p.userId), nickname: p.nickname || '用户',
    avatar: p.avatarUrl || '', vip: !!(d.account && d.account.vipType),
  };
}

function songOf(x) {
  const al = x.al || x.album || {};
  const ar = x.ar || x.artists || [];
  return {
    id: String(x.id), name: x.name || '',
    artists: ar.map(a => a.name).join(' / '),
    album: al.name || '', pic: al.picUrl || '',
    duration: x.dt || x.duration || 0,
  };
}

async function songDetail(ids, session) {
  if (!ids.length) return [];
  const c = '[' + ids.map(i => '{"id":' + Number(i) + '}').join(',') + ']';
  const j = await ncm('v3/song/detail', { c }, session);
  return (j.songs || []).map(songOf);
}

async function songUrl(id, level, session) {
  const j = await ncm('song/enhance/player/url/v1', { ids: '[' + id + ']', level, encodeType: 'mp3' }, session);
  const d = (j.data && j.data[0]) || {};
  if (d.url) return { url: httpsify(d.url), type: d.type || 'mp3', br: d.br || 0, size: d.size || 0, level };
  const fb = { lossless: 'exhigh', exhigh: 'higher', higher: 'standard', standard: null }[level];
  return fb ? songUrl(id, fb, session) : null;
}

const LEVEL_LABEL = { standard: '标准', higher: '较高', exhigh: '极高 320k', lossless: '无损' };

/* ---------- QQ 音乐 ---------- */
async function qqSearch(kw, cookie) {
  const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&n=20&p=1&w=' + encodeURIComponent(kw) +
    '&cr=1&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0';
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  const list = (j.data && j.data.song && j.data.song.list) || [];
  return list.map(x => ({
    id: x.songmid || '', name: x.songname || '',
    artists: (x.singer || []).map(a => a.name).join(' / '),
    album: x.albumname || '',
    pic: x.albummid ? `https://y.qq.com/music/photo_new/T002R300x300M000${x.albummid}.jpg` : '',
    duration: (x.interval || 0) * 1000,
  }));
}

function qqUin(cookie) {
  const m = /(?:^|;\s*)(?:p_)?uin=o?(\d+)/.exec(cookie || '');
  return m ? m[1] : '';
}

async function qqUrl(mid, level, cookie) {
  const prefix = { standard: 'M500', higher: 'M500', exhigh: 'M800', lossless: 'F000' }[level] || 'M500';
  const ext = level === 'lossless' ? '.flac' : '.mp3';
  const payload = {
    req_0: {
      module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
      param: {
        guid: '10000', songmid: [mid], songtype: [0], uin: qqUin(cookie) || '0',
        loginflag: 1, platform: '20', filename: [prefix + mid + mid + ext],
      },
    },
    comm: { uin: Number(qqUin(cookie) || 0), format: 'json', ct: 24, cv: 0 },
  };
  const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(payload));
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  const d = (j.req_0 && j.req_0.data) || {};
  const info = (d.midurlinfo || [])[0] || {};
  if (!info.purl) {
    if (level !== 'standard') return qqUrl(mid, 'standard', cookie);
    throw new Error('QQ 音乐没有返回播放地址：这首歌需要会员，或 Cookie 已失效（请更新 QQ Cookie）');
  }
  const sip = (d.sip && d.sip[0]) || 'http://dl.stream.qqmusic.qq.com/';
  return {
    url: httpsify(sip.replace(/\/$/, '') + '/' + info.purl),
    type: level === 'lossless' ? 'flac' : 'mp3',
    br: { standard: 128000, higher: 192000, exhigh: 320000, lossless: 900000 }[level] || 128000,
    size: 0, level,
  };
}

/* ---------- 酷狗 ---------- */
async function kgSearch(kw, cookie) {
  const url = 'https://mobileservice.kugou.com/api/v3/search/song?keyword=' + encodeURIComponent(kw) + '&page=1&pagesize=20&showtype=1';
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://m.kugou.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  return ((j.data && j.data.info) || []).filter(x => x.hash).map(x => ({
    id: x.hash, name: x.songname || '', artists: x.singername || '',
    album: x.album_name || '',
    pic: (x.trans_param && x.trans_param.union_cover) || '',
    duration: (x.duration || 0) * 1000,
  }));
}

async function kgUrl(hash, level, cookie) {
  const url = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + encodeURIComponent(hash);
  const { text } = await httpText(url, { headers: { 'User-Agent': UA_WEB, Referer: 'https://m.kugou.com/', Cookie: cookie || '' } });
  const j = JSON.parse(text);
  let play = j.url || '';
  if (!play && j.backup_url && j.backup_url[0]) play = j.backup_url[0];
  if (!play) {
    if ((j.privilege || 0) > 0) throw new Error('这首歌在酷狗需要会员/付费，当前没有权限（可在「登录」里贴酷狗 Cookie）');
    throw new Error('酷狗没有返回播放地址，换一首或稍后重试');
  }
  return {
    url: httpsify(play), type: (j.extName || 'mp3').toLowerCase(),
    br: (j.bitRate || 0) * 1000, size: j.fileSize || 0, level,
  };
}

/* ---------- 路由 ---------- */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function readSess(req) {
  const hdr = req.headers.get('x-sess') || '';
  const s = await openSess(hdr);
  return s || {};
}

async function handleApi(url, req) {
  const a = url.searchParams.get('a') || '';
  const p = url.searchParams.get('p') || 'netease';
  const sess = await readSess(req);

  try {
    if (a === 'force_login') {
      const body = await req.json();
      const blob = String(body.token || '');
      const st = await openSess(blob);
      if (!st || !st.qr) return json({ error: '二维码已失效，请刷新重试' }, 400);
      const out = { diagnostics: {} };
      // 网页接口（带 cookie）
      try {
        const w = await webQrCheck(st.qr, st.ck || {});
        out.diagnostics.web = w.code;
        if (w.code === 803 && w.cookies && w.cookies.MUSIC_U) {
          out.status = 'ok';
          out.sess = await sealSess({ ncm: pickCookieObj(w.cookies) });
          const me = await profile(pickCookieObj(w.cookies));
          if (me) Object.assign(out, me);
          return json(out);
        }
      } catch (e) { out.diagnostics.web = 'err'; }
      // 客户端接口
      try {
        const r = await ncm('login/qrcode/client/login', { key: st.qr, type: 3 });
        out.diagnostics.eapi = Number(r.code || 0);
        const ck = pickLoginCookie(r);
        if (Number(r.code || 0) === 803 && ck.MUSIC_U) {
          out.status = 'ok';
          out.sess = await sealSess({ ncm: ck });
          const me = await profile(ck);
          if (me) Object.assign(out, me);
          return json(out);
        }
      } catch (e) { out.diagnostics.eapi = 'err'; }
      out.status = 'waiting';
      return json(out);
    }

    if (a === 'me') {
      if (!sess.ncm || !sess.ncm.MUSIC_U) return json({ loggedIn: false });
      const me = await profile(sess.ncm);
      return json(me || { loggedIn: true, nickname: '已登录' });
    }

    if (a === 'status') {
      const out = { netease: { loggedIn: false }, qq: { loggedIn: false }, kg: { loggedIn: false } };
      if (sess.ncm && sess.ncm.MUSIC_U) {
        // 有 Cookie 就算已登录：账号信息只是锦上添花，取不到也不能卡在登录页
        const me = await profile(sess.ncm);
        out.netease = me || { loggedIn: true, nickname: '已登录', cookieOnly: true };
      }
      if (sess.qq) out.qq = { loggedIn: true, nickname: qqUin(sess.qq) ? 'QQ ' + qqUin(sess.qq) : '已粘贴 Cookie' };
      if (sess.kg) out.kg = { loggedIn: true, nickname: '已粘贴 Cookie' };
      return json(out);
    }

    if (a === 'login_qr') {
      let key = '';
      let via = 'web';
      let qrCookies = {};
      try {
        const r = await webQrUnikey();
        key = r.unikey;
        qrCookies = r.cookies || {};
      } catch (e) { }
      if (!key) {
        via = 'eapi';
        try {
          const k = await ncm('login/qrcode/unikey', { type: 3 });
          key = k.unikey || '';
        } catch (e) { }
      }
      if (!key) return json({ error: '获取二维码失败（网易云接口异常）' }, 502);
      const link = 'https://music.163.com/login?codekey=' + key;
      const blob = await sealSess({ qr: key, ck: qrCookies, ts: Math.floor(Date.now() / 1000) });
      return json({ token: blob, qrurl: link, svg: qrSvg(link, 4), via });
    }

    if (a === 'login_check') {
      const blob = url.searchParams.get('token') || '';
      const st = await openSess(blob);
      if (!st || !st.qr) return json({ code: 800, status: 'expired', error: '二维码已失效，请刷新' });
      let code = 0;
      let ck = null;
      let via = 'web';
      const seen = {};
      try {
        const w = await webQrCheck(st.qr, st.ck || {});
        code = w.code;
        seen.web = w.code;
        seen.webMsg = w.message;
        if (code === 803) ck = pickCookieObj(w.cookies);
      } catch (e) { seen.web = 'err:' + String(e).slice(0, 60); via = 'eapi'; }
      if (via === 'eapi' || !code) {
        try {
          const r = await ncm('login/qrcode/client/login', { key: st.qr, type: 3 });
          code = Number(r.code || 0);
          seen.eapi = code;
          if (code === 803) ck = pickLoginCookie(r);
        } catch (e) { seen.eapi = 'err'; }
      }
      if (code === 803 && (!ck || !ck.MUSIC_U)) {
        // 网页接口没给 cookie 时，再用客户端接口问一次同一个 key
        try {
          const r = await ncm('login/qrcode/client/login', { key: st.qr, type: 3 });
          if (Number(r.code || 0) === 803) ck = pickLoginCookie(r);
        } catch (e) { }
      }
      if (code === 803) {
        if (!ck || !ck.MUSIC_U) return json({ code: 803, status: 'fail', error: '登录成功但没拿到 Cookie，请刷新重试' });
        const me = { code: 803, status: 'ok', loggedIn: true, nickname: '已登录', sess: await sealSess({ ncm: ck }) };
        try {
          const info = await profile(ck);
          if (info && info.loggedIn) Object.assign(me, info);
        } catch (e) { }
        return json(me);
      }
      if (code === 802) return json({ code: 802, status: 'scanned', seen });
      if (code === 800 || Math.floor(Date.now() / 1000) - (st.ts || 0) > 900) return json({ code: 800, status: 'expired', error: '二维码已过期，请刷新', seen });
      return json({ code: 801, status: 'waiting', seen });
    }

    if (a === 'set_cookie') {
      const body = await req.json();
      const plat = body.platform;
      const ck = String(body.cookie || '').trim().replace(/\s*\n\s*/g, ' ').replace(/\s*;\s*/g, '; ');
      if (!['qq', 'kg', 'netease'].includes(plat)) return json({ error: '不支持的平台' }, 400);
      if (!ck) return json({ error: 'Cookie 不能为空' }, 400);
      let next;
      if (plat === 'netease') {
        const mm = /MUSIC_U=([^;]+)/.exec(ck);
        if (!mm) return json({ error: '没找到 MUSIC_U，请复制完整 Cookie' }, 400);
        const csrf = /__csrf=([^;]+)/.exec(ck);
        next = { ...sess, ncm: { MUSIC_U: mm[1], ...(csrf ? { __csrf: csrf[1] } : {}) } };
      } else {
        next = { ...sess, [plat]: ck };
      }
      const blob = await sealSess(next);
      const out = { ok: true, sess: blob, netease: { loggedIn: !!sess.ncm }, qq: { loggedIn: false }, kg: { loggedIn: false } };
      if (next.ncm && next.ncm.MUSIC_U) {
        const me = await profile(next.ncm);
        out.netease = me || { loggedIn: true, nickname: '已登录', cookieOnly: true };
      }
      if (next.qq) out.qq = { loggedIn: true, nickname: qqUin(next.qq) ? 'QQ ' + qqUin(next.qq) : '已粘贴 Cookie' };
      if (next.kg) out.kg = { loggedIn: true, nickname: '已粘贴 Cookie' };
      return json(out);
    }

    if (a === 'clear_cookie') {
      const body = await req.json();
      const plat = body.platform;
      const next = { ...sess };
      delete next[plat];
      return json({ ok: true, sess: await sealSess(next) });
    }

    if (a === 'logout') {
      return json({ ok: true, sess: await sealSess({}) });
    }

    if (a === 'resolve') {
      const body = await req.json();
      const input = String(body.input || '').trim();
      if (!input) return json({ error: '请输入歌名或链接' }, 400);
      if (p === 'qq') {
        const m = /playlist\/(\d+)|disstid=(\d+)/.exec(input);
        if (m) {
          const id = m[1] || m[2];
          const payload = { req_0: { module: 'music.srfDissInfo.DissInfo', method: 'CgiGetDiss', param: { disstid: Number(id), enc_host_uin: '', tag: 1, userinfo: 1, song_begin: 0, song_num: 300 } }, comm: { uin: 0, format: 'json', ct: 24, cv: 0 } };
          const u = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(payload));
          const { text } = await httpText(u, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/', Cookie: sess.qq || '' } });
          const j = JSON.parse(text);
          const d = (j.req_0 && j.req_0.data) || {};
          const songs = (d.songlist || []).map(x => ({
            id: x.mid, name: x.name, artists: (x.singer || []).map(a => a.name).join(' / '),
            album: (x.album && x.album.name) || '', pic: x.album && x.album.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${x.album.mid}.jpg` : '',
            duration: (x.interval || 0) * 1000,
          }));
          return json({ type: 'playlist', id, name: (d.dirinfo && d.dirinfo.title) || '歌单', count: songs.length, songs });
        }
        const one = /songDetail\/([0-9A-Za-z]{10,})/.exec(input);
        if (one) {
          const payload = { req_0: { module: 'music.pf_song_detail_svr', method: 'get_song_detail', param: { song_mid: one[1] } }, comm: { uin: 0, format: 'json', ct: 24, cv: 0 } };
          const u = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(payload));
          const { text } = await httpText(u, { headers: { 'User-Agent': UA_WEB, Referer: 'https://y.qq.com/' } });
          const j = JSON.parse(text);
          const t = j.req_0 && j.req_0.data && j.req_0.data.track_info;
          if (!t) return json({ error: '没找到这首歌' }, 404);
          return json({ type: 'song', song: {
            id: t.mid, name: t.name, artists: (t.singer || []).map(a => a.name).join(' / '),
            album: (t.album && t.album.name) || '', pic: t.album && t.album.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${t.album.mid}.jpg` : '',
            duration: (t.interval || 0) * 1000,
          } });
        }
        return json({ type: 'search', keywords: input, songs: await qqSearch(input, sess.qq) });
      }
      if (p === 'kg') {
        const m = /^[0-9a-f]{32}$/i.exec(input);
        if (m) {
          const u = 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + input;
          const { text } = await httpText(u, { headers: { 'User-Agent': UA_WEB, Referer: 'https://m.kugou.com/' } });
          const j = JSON.parse(text);
          if (j.songName) return json({ type: 'song', song: {
            id: input, name: j.songName, artists: j.author_name || '', album: '',
            pic: (j.album_img || '').replace('{size}', '400'), duration: (j.timeLength || 0) * 1000,
          } });
        }
        return json({ type: 'search', keywords: input, songs: await kgSearch(input, sess.kg) });
      }
      // 网易云
      const pl = /playlist(?:\?|%3F)[^#]*id=(\d+)/i.exec(input) || /playlist\/(\d+)/.exec(input);
      if (pl) {
        const j = await ncm('v6/playlist/detail', { id: Number(pl[1]), n: 100000, s: 8 }, sess.ncm || {});
        const plInfo = j.playlist || {};
        const ids = (plInfo.trackIds || []).slice(0, 300).map(x => String(x.id));
        const songs = ids.length ? await songDetail(ids, sess.ncm || {}) : [];
        return json({ type: 'playlist', id: pl[1], name: plInfo.name || '歌单', count: ids.length, songs });
      }
      const ids = [];
      if (/^\d{5,12}$/.test(input)) ids.push(input);
      else {
        const re = /(?:song\?id=|song\/|id=)(\d{5,12})/g;
        let m;
        while ((m = re.exec(input))) if (!ids.includes(m[1])) ids.push(m[1]);
      }
      if (ids.length) {
        const songs = await songDetail(ids.slice(0, 300), sess.ncm || {});
        if (!songs.length) return json({ error: '没找到这首歌，链接可能不对' }, 404);
        return json(songs.length === 1 ? { type: 'song', song: songs[0] } : { type: 'list', songs });
      }
      const j = await ncm('search/get', { s: input, type: 1, limit: 20, offset: 0 }, sess.ncm || {});
      const songs = ((j.result && j.result.songs) || []).map(songOf);
      return json({ type: 'search', keywords: input, songs });
    }

    if (a === 'url') {
      const body = await req.json();
      const id = String(body.id || '');
      const level = String(body.level || 'exhigh');
      if (!id) return json({ error: '缺少 id' }, 400);
      let u;
      if (p === 'qq') u = await qqUrl(id, level, sess.qq);
      else if (p === 'kg') u = await kgUrl(id, level, sess.kg);
      else u = await songUrl(id, level, sess.ncm || {});
      if (!u) return json({ error: '没有可用地址（可能需要 VIP 或无版权）' }, 404);
      return json({ ...u, label: LEVEL_LABEL[u.level] || u.level });
    }

    if (a === 'download') {
      const id = url.searchParams.get('id') || '';
      const level = url.searchParams.get('level') || 'exhigh';
      const name = (url.searchParams.get('name') || '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
      let u;
      if (p === 'qq') u = await qqUrl(id, level, sess.qq);
      else if (p === 'kg') u = await kgUrl(id, level, sess.kg);
      else u = await songUrl(id, level, sess.ncm || {});
      if (!u) return json({ error: '没有可用地址' }, 404);

      const ref = p === 'qq' ? 'https://y.qq.com/' : p === 'kg' ? 'https://www.kugou.com/' : 'https://music.163.com/';
      const wantProxy = url.searchParams.get('proxy') === '1' || !!name;

      if (!wantProxy) {
        // 默认 302 直连 CDN：不占 Worker 带宽，速度最快
        return Response.redirect(u.url, 302);
      }
      // 需要带文件名时由 Worker 转发
      const r = await fetch(u.url, { headers: { 'User-Agent': UA_WEB, Referer: ref } });
      if (!r.ok) return json({ error: '下载失败（CDN 返回 ' + r.status + '）' }, 502);
      const fn = (name || 'music') + '.' + (u.type || 'mp3');
      const headers = {
        'Content-Type': r.headers.get('content-type') || 'audio/mpeg',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fn),
        'Cache-Control': 'no-store',
      };
      const len = r.headers.get('content-length');
      if (len) headers['Content-Length'] = len;
      return new Response(r.body, { headers });
    }

    if (a === 'diag') {
      const out = { runtime: 'cloudflare-worker', now: new Date().toISOString(), colo: (req.cf && req.cf.colo) || '' };
      try { out.encoder = typeof qrcode === 'function'; out.svgLen = qrSvg('diag').length; } catch (e) { out.qr_error = String(e); }
      // 直接看一下网易云接口的原始返回，方便判断是不是被墙/限流
      try {
        const r = await httpText('https://music.163.com/eapi/login/qrcode/unikey', {
          method: 'POST',
          headers: { 'User-Agent': UA_NCM, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://music.163.com/' },
          body: await eapiPayload('/api/login/qrcode/unikey', { type: 3, header: deviceCookie(), e_r: false }),
        });
        out.raw_status = r.status;
        out.raw_head = (r.text || '').slice(0, 160);
        try { const j = JSON.parse(r.text); out.netease_api = { code: j.code, has_key: !!j.unikey }; } catch (e) { out.netease_api = { parse_error: true }; }
      } catch (e) {
        out.netease_api = { error: String(e) };
      }
      return json(out);
    }

    return json({ error: '未知操作' }, 404);
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.searchParams.has('a')) return handleApi(url, req);

    // 赞赏图：/1 = 微信，/2 = 支付宝（图已内嵌，不需要额外文件）
    const m = /^\/([12])$/.exec(url.pathname);
    if (m) {
      // 如果仓库里放了 public/1.png、public/2.png，优先用它们（方便你随时换图）
      if (env && env.ASSETS) {
        for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
          const res = await env.ASSETS.fetch(new Request(new URL('/' + m[1] + '.' + ext, url), req));
          if (res.ok) {
            return new Response(res.body, {
              headers: { 'Content-Type': res.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=600' },
            });
          }
        }
      }
      const img = m[1] === '1' ? DONATE_WECHAT : DONATE_ALIPAY;
      if (img) {
        const bin = Uint8Array.from(atob(img.b64), c => c.charCodeAt(0));
        return new Response(bin, { headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=86400' } });
      }
      return new Response('not found', { status: 404 });
    }
    return new Response(PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};

/* ============================================================
 * 页面
 * ============================================================ */
const PAGE = "<!DOCTYPE html>\n<html lang=\"zh-CN\" data-theme=\"auto\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#ff3a3a\">\n<title>音乐下载 · 网易云 / QQ / 酷狗</title>\n<style>\n:root{--bg:#f5f6fa;--bg2:#eceef6;--card:rgba(255,255,255,.88);--fg:#14161c;--sub:#6b7180;--line:rgba(20,22,28,.08);\n--acc:#ff3a3a;--acc2:#ff7a45;--ok:#12a150;--radius:18px;--shadow:0 10px 30px rgba(30,35,60,.08)}\n[data-theme=dark]{--bg:#0e1015;--bg2:#090a0e;--card:rgba(28,31,40,.85);--fg:#eef0f5;--sub:#9aa1b0;--line:rgba(255,255,255,.08);\n--acc:#ff4d4d;--acc2:#ff9052;--ok:#3ddc84;--shadow:0 12px 34px rgba(0,0,0,.45)}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nbody{margin:0;min-height:100vh;color:var(--fg);\nbackground:radial-gradient(1200px 600px at 10% -10%,rgba(255,58,58,.16),transparent 60%),radial-gradient(900px 500px at 110% 10%,rgba(90,120,255,.14),transparent 60%),linear-gradient(180deg,var(--bg),var(--bg2));\nbackground-attachment:fixed;font:15px/1.55 -apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Noto Sans CJK SC\",sans-serif;\npadding:calc(12px + env(safe-area-inset-top)) 14px calc(28px + env(safe-area-inset-bottom))}\n.wrap{max-width:720px;margin:0 auto}\n.top{display:flex;align-items:center;gap:12px;padding:4px 2px 16px}\n.logo{width:44px;height:44px;border-radius:14px;flex:none;display:grid;place-items:center;color:#fff;font-weight:800;font-size:20px;\nbackground:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 8px 20px rgba(255,58,58,.35)}\n.top h1{font-size:18px;margin:0}.top .sub{font-size:12.5px;color:var(--sub)}.top .spacer{flex:1}\n.icon-btn{width:38px;height:38px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:grid;place-items:center;cursor:pointer;font-size:17px}\n.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;margin-bottom:14px;backdrop-filter:blur(16px)}\n.card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px}\n.card-h .t{font-weight:700;display:flex;align-items:center;gap:8px}\n.card-h .t .dot{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 4px rgba(255,58,58,.14)}\n.plats{display:flex;gap:8px;margin-bottom:14px;background:rgba(20,22,28,.05);padding:5px;border-radius:16px}\n[data-theme=dark] .plats{background:rgba(255,255,255,.06)}\n.plats button{flex:1;padding:11px 8px;border-radius:12px;background:transparent;color:var(--sub);border:none;font-weight:650;font-size:14px;cursor:pointer;font-family:inherit}\n.plats button.on{background:var(--card);color:var(--fg);box-shadow:0 4px 14px rgba(0,0,0,.10)}\n.plats .live{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);margin-right:6px;vertical-align:1px;opacity:.25}\n.plats .live.on{opacity:1}\ninput[type=text],textarea{width:100%;font:inherit;color:inherit;padding:13px 14px;border-radius:14px;border:1px solid var(--line);background:rgba(125,125,125,.08);outline:none}\ntextarea{min-height:96px;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;resize:vertical}\ninput:focus,textarea:focus{border-color:var(--acc);box-shadow:0 0 0 4px rgba(255,58,58,.12)}\nbutton{font:inherit;cursor:pointer;border:none;border-radius:14px;padding:13px 18px;font-weight:650;color:#fff;white-space:nowrap;\nbackground:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 8px 18px rgba(255,58,58,.28)}\nbutton:disabled{opacity:.55;box-shadow:none}\nbutton.ghost{background:rgba(125,125,125,.10);color:var(--fg);box-shadow:none;border:1px solid var(--line);font-weight:600}\nbutton.small{padding:8px 12px;font-size:13px;border-radius:11px}\nbutton.tiny{padding:6px 10px;font-size:12px;border-radius:9px}\n.input-row{display:flex;gap:8px}input[type=text]{flex:1;min-width:0}\n.quality{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 14px}\n.quality button{background:rgba(125,125,125,.10);color:var(--sub);border:1px solid var(--line);box-shadow:none;padding:8px 13px;font-size:13px;border-radius:999px}\n.quality button.on{color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));border-color:transparent}\n.qr-frame{position:relative;width:min(340px,86vw,100%);aspect-ratio:1;margin:6px auto 12px;border-radius:22px;background:#fff;padding:10px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.12)}\n.qr-frame svg{position:absolute;inset:10px;width:calc(100% - 20px)!important;height:calc(100% - 20px)!important;display:block;border-radius:12px}\n.qr-overlay{position:absolute;inset:0;display:none;place-items:center;background:rgba(255,255,255,.92);border-radius:22px;color:#222;font-weight:700;font-size:14px}\n.qr-overlay.show{display:grid}\n.qr-hint{color:var(--sub);font-size:13px;text-align:center;min-height:22px}\n.qr-hint b{color:var(--fg)}.qr-hint.ok{color:var(--ok);font-weight:700}\n.steps{display:flex;justify-content:center;gap:6px;margin-top:10px;flex-wrap:wrap}\n.steps span{font-size:11.5px;color:var(--sub);background:rgba(125,125,125,.10);padding:4px 9px;border-radius:999px}\n.song{display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px}\n.song:hover{background:rgba(125,125,125,.06)}\n.song .cover{width:46px;height:46px;border-radius:11px;object-fit:cover;background:rgba(125,125,125,.15);flex:none}\n.song .m{flex:1;min-width:0}\n.song .tt{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.song .dd{color:var(--sub);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.song .acts{display:flex;gap:6px;flex:none}\n.list-head{display:flex;justify-content:space-between;margin:4px 0 10px;gap:10px}\n.list-head .l{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.list-head .r{color:var(--sub);font-size:12.5px}\n.url-line{font-size:12px;color:var(--sub);margin:2px 0 6px 58px;word-break:break-all}\n.url-line a{color:var(--acc);text-decoration:none}\n.empty{color:var(--sub);text-align:center;padding:18px 6px;font-size:13.5px}\n.err{color:var(--acc);font-size:13px;margin-top:10px;background:rgba(255,58,58,.08);padding:10px 12px;border-radius:12px}\n.hide{display:none!important}\n.spin{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:s .7s linear infinite;vertical-align:-2px}\n@keyframes s{to{transform:rotate(360deg)}}\n.center{display:flex;align-items:center;justify-content:center;gap:8px}\n.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translate(-50%,20px);background:rgba(20,22,28,.92);color:#fff;\npadding:10px 16px;border-radius:999px;font-size:13.5px;opacity:0;pointer-events:none;transition:.25s;z-index:9}\n.toast.on{opacity:1;transform:translate(-50%,0)}\n.help{color:var(--sub);font-size:12.5px;line-height:1.75;margin:8px 0 12px}\n.help code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:5px;font-size:12px}\n.foot{text-align:center;color:var(--sub);font-size:11.5px;margin-top:18px;line-height:1.7}\n.user{display:flex;align-items:center;gap:12px}\n.avatar{width:46px;height:46px;border-radius:50%;object-fit:cover;background:rgba(125,125,125,.15);flex:none}\n.user .n{font-weight:700}\n.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,58,58,.12);color:var(--acc);font-weight:700;margin-left:6px}\n.badge.g{background:rgba(18,161,80,.14);color:var(--ok)}\n.modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px}\n.modal.hide{display:none}\n.modal-mask{position:absolute;inset:0;background:rgba(10,12,18,.55)}\n.modal-box{position:relative;width:min(380px,92vw);background:var(--card);border:1px solid var(--line);border-radius:22px;padding:16px;box-shadow:0 24px 60px rgba(0,0,0,.35)}\n.modal-h{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:12px}\n.dtabs{display:flex;gap:8px;background:rgba(125,125,125,.10);padding:4px;border-radius:14px;margin-bottom:12px}\n.dtabs button{flex:1;padding:9px;border-radius:11px;background:transparent;color:var(--sub);box-shadow:none;font-weight:650;font-size:13.5px}\n.dtabs button.on{background:var(--card);color:var(--fg)}\n.helpbox{max-height:56vh;overflow:auto;font-size:13.5px;line-height:1.85}\n.helpbox ol{padding-left:20px}.helpbox code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:5px}\n.helpbox .k{color:var(--acc);font-weight:700}\n.sponsor-btn{height:38px;padding:0 14px;border-radius:12px;color:#fff;font-size:13.5px;font-weight:700;letter-spacing:2px;\nbackground:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 6px 16px rgba(255,58,58,.28);white-space:nowrap;flex:none}\n.sponsor-btn:active{transform:scale(.96)}\n.dtitle{text-align:center;font-size:20px;font-weight:800;letter-spacing:6px;margin:2px 0 12px}\n.dimg-box{position:relative;display:grid;place-items:center;min-height:220px;border-radius:16px;background:#fff;padding:10px}\n.dimg-box img{max-width:100%;max-height:min(52vh,340px);border-radius:10px;display:none}\n.dempty{color:#b9bec9;font-size:28px;font-weight:800;letter-spacing:8px}\n.dnote{text-align:center;color:var(--sub);font-size:12px;margin-top:10px}\n.applogin{width:100%;margin-top:6px}\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <div class=\"top\">\n    <div class=\"logo\" id=\"brandLogo\">♪</div>\n    <div><h1 id=\"brandTitle\">音乐下载</h1><div class=\"sub\" id=\"brandSub\">网易云 / QQ 音乐 / 酷狗</div></div>\n    <div class=\"spacer\"></div>\n    <button class=\"sponsor-btn\" id=\"btnDonate\">赞助</button>\n    <button class=\"icon-btn\" id=\"btnTheme\" title=\"深浅色\">◐</button>\n  </div>\n\n  <div class=\"plats\" id=\"plats\">\n    <button data-p=\"netease\" class=\"on\"><span class=\"live\" id=\"dot-netease\"></span>网易云</button>\n    <button data-p=\"qq\"><span class=\"live\" id=\"dot-qq\"></span>QQ 音乐</button>\n    <button data-p=\"kg\"><span class=\"live\" id=\"dot-kg\"></span>酷狗</button>\n  </div>\n\n  <div class=\"card\" id=\"qrCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span>扫码登录</div></div>\n    <div class=\"qr-frame\" id=\"qrFrame\"><div class=\"qr-overlay\" id=\"qrOverlay\"><div id=\"qrOverlayText\">二维码已失效</div></div></div>\n    <div class=\"qr-hint\" id=\"qrHint\">正在生成二维码…</div>\n    <button class=\"applogin\" id=\"btnAppLogin\">📱 就在这台手机上登录</button>\n    <div class=\"help\" style=\"text-align:center;margin:8px 0 0\">装了网易云 App 的话，点上面的按钮会直接打开 App 确认登录</div>\n    <button class=\"ghost small hide\" id=\"btnForceLogin\" style=\"width:100%;margin-top:8px\">✅ 已在手机上确认，立即检查</button>\n    <div class=\"steps\"><span>① 打开网易云 App</span><span>② 扫一扫</span><span>③ 确认登录</span></div>\n    <div style=\"display:flex;gap:8px;margin-top:12px\">\n      <button class=\"ghost small\" id=\"btnRefreshQr\" style=\"flex:1\">刷新二维码</button>\n      <button class=\"ghost small\" id=\"btnQrLink\" style=\"flex:1\">显示链接</button>\n    </div>\n    <div class=\"url-line hide\" id=\"qrLink\" style=\"margin-left:0\"></div>\n  </div>\n\n  <div class=\"card hide\" id=\"cookieCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span><span id=\"cookieTitle\">登录</span></div>\n      <button class=\"ghost small\" id=\"btnCookieHelp\">怎么取？</button></div>\n    <div class=\"help\" id=\"cookieHelp\"></div>\n    <div class=\"help\" id=\"ncmFallbackTips\" style=\"display:none\">扫码一直失败？可以直接贴网易云 Cookie：手机浏览器登录 <code>music.163.com</code> 后取 <code>MUSIC_U=</code> 那一段。</div>\n    <textarea id=\"cookieInput\" placeholder=\"粘贴 Cookie，如 uin=o1234567; qm_keyst=xxxx\"></textarea>\n    <div style=\"display:flex;gap:8px;margin-top:10px\">\n      <button id=\"btnSaveCookie\" style=\"flex:1\">保存 Cookie</button>\n      <button class=\"ghost\" id=\"btnClearCookie\">清除</button>\n    </div>\n  </div>\n\n  <div class=\"card hide\" id=\"userCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span>账号</div><button class=\"ghost small\" id=\"btnLogout\">退出</button></div>\n    <div id=\"userBox\"></div>\n  </div>\n\n  <div class=\"card\" id=\"dlCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span>下载</div></div>\n    <div class=\"input-row\"><input id=\"q\" type=\"text\" placeholder=\"粘贴歌曲 / 歌单链接，或输入歌名\" autocomplete=\"off\"><button id=\"btnGo\">搜索</button></div>\n    <div class=\"quality\" id=\"quality\"></div>\n    <div class=\"err hide\" id=\"err\"></div>\n    <div id=\"results\"></div>\n  </div>\n\n  <div class=\"foot\">仅供下载自己有权收听的歌曲 · 登录态只存在你浏览器里</div>\n</div>\n<div class=\"toast\" id=\"toast\"></div>\n\n<div class=\"modal hide\" id=\"donateModal\">\n  <div class=\"modal-mask\" id=\"donateMask\"></div>\n  <div class=\"modal-box\">\n    <div class=\"modal-h\"><span>赞助</span><button class=\"icon-btn\" id=\"donateClose\" style=\"width:32px;height:32px;font-size:15px\">✕</button></div>\n    <div class=\"dtitle\">赞赏码</div>\n    <div class=\"dtabs\" id=\"dtabs\"><button data-k=\"wechat\" class=\"on\">微信</button><button data-k=\"alipay\">支付宝</button></div>\n    <div class=\"dimg-box\"><img id=\"donateImg\" alt=\"赞赏二维码\"><div class=\"dempty\" id=\"donateEmpty\">赞赏码</div></div>\n    <div class=\"dnote\">长按图片识别 · 感谢支持 ♥</div>\n  </div>\n</div>\n\n<div class=\"modal hide\" id=\"helpModal\">\n  <div class=\"modal-mask\" id=\"helpMask\"></div>\n  <div class=\"modal-box\">\n    <div class=\"modal-h\"><span>怎么取 Cookie</span><button class=\"icon-btn\" id=\"helpClose\" style=\"width:32px;height:32px;font-size:15px\">✕</button></div>\n    <div class=\"dtabs\" id=\"htabs\"><button data-k=\"pc\" class=\"on\">电脑</button><button data-k=\"phone\">手机</button></div>\n    <div class=\"helpbox\" id=\"helpBody\"></div>\n  </div>\n</div>\n\n<script>\nconst $ = (s, r = document) => r.querySelector(s);\nconst $$ = (s, r = document) => [...r.querySelectorAll(s)];\nconst BASE = location.pathname;\nlet token = localStorage.getItem('m_token') || '';\nlet sess = localStorage.getItem('m_sess') || '';\nlet platform = localStorage.getItem('m_platform') || 'netease';\nlet level = localStorage.getItem('m_level') || 'exhigh';\nlet lastList = [], pollTimer = null, qrLinkText = '';\nlet status = { netease:{loggedIn:false}, qq:{loggedIn:false}, kg:{loggedIn:false} };\n\nconst P = {\n  netease:{title:'网易云音乐 · 离线下载', sub:'扫码登录 · 按账号权限下载', logo:'♪'},\n  qq:{title:'QQ 音乐 · 离线下载', sub:'粘贴 Cookie · 按账号权限下载', logo:'♫'},\n  kg:{title:'酷狗音乐 · 离线下载', sub:'免费歌曲直接下 · 会员贴 Cookie', logo:'♬'},\n};\nconst LEVELS = {\n  netease:[['standard','标准 128k'],['higher','较高 192k'],['exhigh','极高 320k'],['lossless','无损']],\n  qq:[['standard','标准 128k'],['exhigh','极高 320k'],['lossless','无损 FLAC']],\n  kg:[['standard','标准 128k']],\n};\n\nconst esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst fmtDur = ms => { if(!ms) return ''; const t = Math.round(ms/1000); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); };\nfunction toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),2400); }\nfunction setErr(m){ const e=$('#err'); if(!m){e.classList.add('hide');return;} e.textContent=m; e.classList.remove('hide'); }\n\nfunction authHeaders(base = {}){ const h = {...base}; if(sess) h['X-Sess']=sess; return h; }\nfunction saveSess(b){ if(!b) return; sess=b; localStorage.setItem('m_sess', b); }\n\nasync function api(a, opt = {}){\n  const h = authHeaders({ 'Content-Type':'application/json' });\n  Object.assign(h, opt.headers || {});\n  const sep = '&';\n  const r = await fetch(BASE + '?a=' + a + sep + 'p=' + platform, { ...opt, headers: h });\n  const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));\n  if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status));\n  return j;\n}\n\n/* 主题 */\nfunction resolveTheme(t){ return t==='auto' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : t; }\nfunction applyTheme(t){ document.documentElement.setAttribute('data-theme', resolveTheme(t)); }\nlet theme = localStorage.getItem('m_theme') || 'auto';\napplyTheme(theme);\n$('#btnTheme').onclick = () => { theme = resolveTheme(theme)==='dark'?'light':'dark'; localStorage.setItem('m_theme',theme); applyTheme(theme); };\n\n/* 平台 */\nfunction applyBrand(){\n  const p = P[platform];\n  $('#brandTitle').textContent = p.title;\n  $('#brandSub').textContent = p.sub;\n  $('#brandLogo').textContent = p.logo;\n  $$('#plats button').forEach(b => b.classList.toggle('on', b.dataset.p === platform));\n  ['netease','qq','kg'].forEach(k => $('#dot-'+k).classList.toggle('on', !!(status[k] && status[k].loggedIn)));\n  if(!LEVELS[platform].some(x => x[0] === level)) level = 'exhigh';\n  renderQuality(); refreshUi();\n}\nfunction refreshUi(){\n  const logged = !!(status[platform] && status[platform].loggedIn);\n  const isQr = platform === 'netease';\n  $('#qrCard').classList.toggle('hide', !(isQr && !logged));\n  // 三个平台都显示 Cookie 卡片：网易云扫码失败时可以改用 Cookie 登录\n  $('#cookieCard').classList.toggle('hide', logged);\n  if(isQr) showNcmFallback(!$('#qrFrame').querySelector('svg'));\n  $('#userCard').classList.toggle('hide', !logged);\n  if(!logged){\n    $('#cookieTitle').textContent = platform === 'qq' ? '登录 QQ 音乐'\n      : platform === 'kg' ? '登录酷狗（可选）' : '改用 Cookie 登录（可选）';\n    $('#cookieHelp').innerHTML = platform === 'qq'\n      ? 'QQ 音乐没有可用的网页扫码接口，需要粘贴 Cookie（含 <code>uin=</code> 和 <code>qm_keyst=</code>）。'\n      : platform === 'kg'\n        ? '不贴 Cookie 也能下免费歌曲；会员/付费歌曲需要登录后的 Cookie（含 <code>userid=</code>、<code>token=</code>）。'\n        : '扫码登不上时，可以贴网易云网页版的 Cookie，只要含 <code>MUSIC_U=</code> 这一段就行。';\n  }\n  if(logged){\n    const me = status[platform];\n    $('#userBox').innerHTML = `<div class=\"user\">\n      ${me.avatar?`<img class=\"avatar\" src=\"${esc(me.avatar)}\" alt=\"\">`:`<div class=\"avatar\" style=\"display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2))\">${esc((me.nickname||'?').slice(0,1))}</div>`}\n      <div><div class=\"n\">${esc(me.nickname||'已登录')}<span class=\"badge ${me.vip?'':'g'}\">${me.vip?'VIP':'普通'}</span></div>\n      <div class=\"help\" style=\"margin:0\">${esc(P[platform].title.split(' · ')[0])}</div></div></div>`;\n  }\n  $('#q').placeholder = platform==='qq' ? '粘贴 QQ 音乐歌曲 / 歌单链接，或输入歌名'\n    : platform==='kg' ? '粘贴酷狗歌曲链接，或输入歌名' : '粘贴网易云歌曲 / 歌单链接，或输入歌名';\n}\nfunction renderQuality(){\n  $('#quality').innerHTML = LEVELS[platform].map(([k,l]) => `<button data-lv=\"${k}\" class=\"${k===level?'on':''}\">${l}</button>`).join('');\n  $$('#quality button').forEach(b => b.onclick = () => { level=b.dataset.lv; localStorage.setItem('m_level',level); renderQuality(); });\n}\n\n/* 登录状态 */\nasync function refreshStatus(){\n  try {\n    const j = await fetch(BASE + '?a=status', { headers: authHeaders(), cache:'no-store' }).then(r => r.json());\n    status = j;\n  } catch(e){}\n  applyBrand();\n  if(platform==='netease' && !(status.netease && status.netease.loggedIn) && !document.querySelector('#qrFrame svg')) startQr();\n}\n\n/* 扫码 */\nfunction paintQr(svg){\n  const f = $('#qrFrame');\n  [...f.querySelectorAll('svg')].forEach(n => n.remove());\n  f.classList.remove('hide');\n  if(!svg) return false;\n  f.insertAdjacentHTML('afterbegin', svg);\n  return true;\n}\nfunction setOverlay(show, text){\n  const o = $('#qrOverlay');\n  if (text) $('#qrOverlayText').textContent = text;\n  o.classList.toggle('show', !!show);\n}\nconst QR_KEY = 'm_qr_state';\nfunction storeQr(o){ try{ localStorage.setItem(QR_KEY, JSON.stringify(o)); }catch(e){} }\nfunction loadQr(){\n  try{\n    const j = JSON.parse(localStorage.getItem(QR_KEY) || 'null');\n    if(!j || !j.token) return null;\n    if(Date.now() - (j.ts||0) > 13*60*1000) return null;\n    return j;\n  }catch(e){ return null; }\n}\nfunction clearQr(){ try{ localStorage.removeItem(QR_KEY); }catch(e){} }\n\nasync function startQr(){\n  clearInterval(pollTimer); pollTimer = null;\n  [...$('#qrFrame').querySelectorAll('svg')].forEach(n => n.remove());\n  setOverlay(false);\n  $('#qrHint').innerHTML = '<span class=\"spin\"></span> 正在生成二维码…';\n  $('#btnForceLogin').classList.add('hide');\n  try{\n    const r = await api('login_qr');\n    paintQr(r.svg);\n    qrLinkText = r.qrurl || '';\n    if(!r.svg){\n      $('#qrHint').innerHTML = '二维码生成失败<br><span style=\"font-size:12px\">打开 ?a=diag 看诊断</span>';\n      setOverlay(true); showNcmFallback(true); return;\n    }\n    $('#qrHint').innerHTML = '用手机<b>网易云音乐</b>扫一扫，然后在手机上点「确认登录」';\n    window._qrToken = r.token;\n    storeQr({ token: r.token, svg: r.svg, url: qrLinkText, ts: Date.now() });\n    let ticks = 0;\n    pollTimer = setInterval(() => { ticks++; check(r.token, ticks); }, 1500);\n    check(r.token, 0);\n  }catch(e){\n    $('#qrHint').innerHTML = '生成失败：' + esc(e.message);\n    setOverlay(true);\n    showNcmFallback(true);\n  }\n}\n\nfunction showNcmFallback(on){\n  // 网易云也可以贴 Cookie，扫码不行时的备用方案\n  const el = $('#ncmFallbackTips');\n  if(el) el.style.display = on ? '' : 'none';\n}\n\n/** 回到页面时接着等原来那张二维码（不换新的） */\nfunction resumeQr(){\n  const st = loadQr();\n  if(!st) return false;\n  if(!paintQr(st.svg)) return false;\n  qrLinkText = st.url || '';\n  setOverlay(false);\n  $('#qrHint').innerHTML = '还在等确认…（用<b>网易云音乐</b>点「确认登录」）';\n  window._qrToken = st.token;\n  clearInterval(pollTimer); pollTimer = null;\n  pollTimer = setInterval(() => check(st.token, 1), 1500);\n  check(st.token, 0);\n  return true;\n}\nfunction tok(t){ window._qrToken = t; return t; }\nasync function check(t, ticks){\n  if(!t) return;\n  try{\n    const j = await fetch(BASE + '?a=login_check&p=' + platform + '&token=' + encodeURIComponent(t), { cache:'no-store' }).then(r=>r.json());\n    if(j.status === 'scanned'){\n      $('#qrHint').innerHTML = '<b style=\"color:var(--ok)\">已扫码</b>，请在手机上点「确认登录」…';\n      $('#btnForceLogin').classList.remove('hide');\n      setOverlay(false);\n      // 注意：这里绝不能停轮询，否则永远收不到 803（登录成功）\n      if(!pollTimer){\n        pollTimer = setInterval(() => check(t, 2), 1500);\n      }\n      // 停在「已扫码」超过约 20 秒，自动重新检查一次（部分机型确认后网页收不到推送）\n      window._scannedTicks = (window._scannedTicks || 0) + 1;\n      if(window._scannedTicks === 12){\n        window._scannedTicks = 0;\n        tryForceLogin(true);\n      }\n    }\n    else if(j.status === 'ok'){\n      clearInterval(pollTimer); pollTimer = null;\n      saveSess(j.sess);\n      clearQr();\n      // 直接用 803 的结果把界面切过去，不再等 /status（避免又被拉回登录页）\n      status.netease = {\n        loggedIn: true,\n        nickname: j.nickname || '已登录',\n        avatar: j.avatar || '',\n        vip: !!j.vip,\n        userId: j.userId || '',\n      };\n      applyBrand();\n      $('#qrHint').innerHTML = '<span style=\"color:var(--ok);font-weight:700\">登录成功 ✓</span>';\n      setOverlay(false);\n      toast('登录成功');\n      // 立刻再取一次昵称/头像/VIP（803 里可能只拿到「已登录」）\n      (async () => {\n        try {\n          const me = await fetch(BASE + '?a=me', { headers: authHeaders(), cache: 'no-store' }).then(r => r.json());\n          if (me && me.loggedIn) { status.netease = me; applyBrand(); }\n        } catch (e) { }\n      })();\n      setTimeout(refreshStatus, 1500);\n    }\n    else if(j.status === 'expired' || j.status === 'fail'){\n      clearInterval(pollTimer); pollTimer = null;\n      clearQr();\n      $('#qrHint').textContent = j.error || '二维码已失效，点刷新';\n      setOverlay(true, '二维码已失效');\n    }\n    else if(ticks && ticks % 6 === 0){\n      const d = j.seen ? `（web=${j.seen.web}${j.seen.eapi !== undefined ? ', eapi=' + j.seen.eapi : ''}）` : '';\n      $('#qrHint').textContent = '仍在等待扫码…' + d;\n    }\n  }catch(e){}\n}\n$('#btnForceLogin').onclick = () => tryForceLogin(false);\n\nasync function tryForceLogin(silent){\n  const t = window._qrToken;\n  if(!t){ if(!silent) toast('二维码已失效，请刷新'); return; }\n  const btn = $('#btnForceLogin');\n  btn.disabled = true; const old = btn.textContent;\n  if(!silent) btn.innerHTML = '<span class=\"spin\"></span> 检查中';\n  try{\n    const j = await fetch(BASE + '?a=force_login', {\n      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),\n      body: JSON.stringify({ token: t }),\n    }).then(r => r.json());\n    if(j.status === 'ok' && j.sess){\n      saveSess(j.sess);\n      clearQr();\n      status.netease = {\n        loggedIn: true,\n        nickname: j.nickname || '已登录',\n        avatar: j.avatar || '',\n        vip: !!j.vip,\n        userId: j.userId || '',\n      };\n      clearInterval(pollTimer); pollTimer = null;\n      applyBrand();\n      toast('登录成功');\n      setTimeout(refreshStatus, 1200);\n    } else {\n      const d = j.diagnostics || {};\n      if(!silent){\n        toast('还没确认成功：web=' + (d.web ?? '?') + ' eapi=' + (d.eapi ?? '?'));\n        $('#qrHint').textContent = '还没检测到确认（web=' + (d.web ?? '?') + ', eapi=' + (d.eapi ?? '?') + '）';\n      }\n    }\n  }catch(e){ if(!silent) toast('检查失败：' + e.message); }\n  btn.disabled = false; btn.textContent = old || '✅ 已在手机上确认，立即检查';\n};\n\n$('#btnAppLogin').onclick = () => {\n  if(!qrLinkText){ toast('二维码还没生成好，稍等'); return; }\n  location.href = qrLinkText;   // 网易云 App 注册了这个链接，会直接唤起并弹「确认登录」\n};\n$('#btnRefreshQr').onclick = startQr;\n$('#btnQrLink').onclick = () => {\n  const l = $('#qrLink');\n  l.classList.toggle('hide');\n  l.innerHTML = `<a href=\"${esc(qrLinkText)}\">${esc(qrLinkText)}</a>`;\n};\n\n/* Cookie */\n$('#btnSaveCookie').onclick = async () => {\n  const ck = $('#cookieInput').value.trim();\n  if(!ck){ setErr('请先粘贴 Cookie'); return; }\n  setErr('');\n  const btn=$('#btnSaveCookie'); btn.disabled=true; const old=btn.textContent; btn.innerHTML='<span class=\"spin\"></span>';\n  try{\n    const r = await fetch(BASE + '?a=set_cookie&p=' + platform, { method:'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ platform, cookie: ck }) });\n    const j = await r.json();\n    if(!r.ok) throw new Error(j.error || '保存失败');\n    saveSess(j.sess);\n    status = j;\n    $('#cookieInput').value='';\n    toast('Cookie 已保存');\n    applyBrand();\n  }catch(e){ setErr(e.message); }\n  btn.disabled=false; btn.textContent=old;\n};\n$('#btnClearCookie').onclick = async () => {\n  try{\n    const r = await fetch(BASE + '?a=clear_cookie&p=' + platform, { method:'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ platform }) });\n    const j = await r.json(); saveSess(j.sess);\n  }catch(e){}\n  status[platform] = { loggedIn:false };\n  applyBrand(); toast('已清除');\n};\n$('#btnLogout').onclick = async () => {\n  clearInterval(pollTimer); pollTimer = null;\n  try{ const j = await api('logout'); saveSess(j.sess); }catch(e){}\n  status[platform] = { loggedIn:false };\n  if(platform==='netease'){ sess=''; localStorage.removeItem('m_sess'); }\n  applyBrand();\n};\n\n/* 赞赏：/1 = 微信，/2 = 支付宝（图片放仓库 public/1.png、public/2.png） */\nlet donateTab = 'wechat';\nfunction renderDonate(){\n  const img = $('#donateImg');\n  const empty = $('#donateEmpty');\n  img.onload = () => { img.style.display = 'block'; empty.style.display = 'none'; };\n  img.onerror = () => { img.style.display = 'none'; empty.style.display = 'block'; };\n  img.src = donateTab === 'wechat' ? '/1' : '/2';\n  $$('#dtabs button').forEach(b => b.classList.toggle('on', b.dataset.k === donateTab));\n}\n$('#btnDonate').onclick = () => { $('#donateModal').classList.remove('hide'); renderDonate(); };\n$('#donateClose').onclick = $('#donateMask').onclick = () => $('#donateModal').classList.add('hide');\n$$('#dtabs button').forEach(b => b.onclick = () => { donateTab = b.dataset.k; renderDonate(); });\n\n/* 教程 */\nconst HELP = {\n  pc:`<b>电脑 Chrome / Edge</b><ol><li>打开 y.qq.com 或 www.kugou.com 并登录</li><li>按 <code>F12</code> → <b>Network</b></li><li>刷新页面，点第一条请求</li><li>Request Headers → <b>Cookie</b>，整行复制</li><li>回本页粘贴保存</li></ol>\n  <div class=\"help\">只要两段也行：QQ 是 <span class=\"k\">uin=</span> + <span class=\"k\">qm_keyst=</span>；酷狗是 <span class=\"k\">userid=</span> + <span class=\"k\">token=</span></div>`,\n  phone:`<b>手机 Android</b><ol><li>装 <b>Kiwi Browser</b> 或狐猴浏览器</li><li>用它打开官网并登录</li><li>右上角 ⋮ → 开发者工具 → Network</li><li>刷新 → 点第一条请求 → Request Headers → Cookie，长按复制</li><li>回本页粘贴保存</li></ol>\n  <div class=\"help\">iPhone 建议用电脑取一次再发到手机粘贴。</div>`,\n};\nfunction renderHelp(k){ $('#helpBody').innerHTML = HELP[k]||HELP.pc; $$('#htabs button').forEach(b=>b.classList.toggle('on', b.dataset.k===k)); }\n$('#btnCookieHelp').onclick = () => { $('#helpModal').classList.remove('hide'); renderHelp('pc'); };\n$('#helpClose').onclick = $('#helpMask').onclick = () => $('#helpModal').classList.add('hide');\n$$('#htabs button').forEach(b => b.onclick = () => renderHelp(b.dataset.k));\n\n/* 搜索/列表 */\nfunction songRow(s, i){\n  return `<div class=\"song\" data-id=\"${esc(s.id)}\">\n    ${i?`<span class=\"help\" style=\"width:20px;text-align:center;margin:0\">${i}</span>`:''}\n    <img class=\"cover\" src=\"${esc(s.pic)}\" alt=\"\" loading=\"lazy\" onerror=\"this.style.visibility='hidden'\">\n    <div class=\"m\"><div class=\"tt\">${esc(s.name)}</div><div class=\"dd\">${esc(s.artists)}${s.album?' · '+esc(s.album):''}${s.duration?' · '+fmtDur(s.duration):''}</div></div>\n    <div class=\"acts\"><button class=\"ghost tiny\" data-act=\"url\">地址</button><button class=\"tiny\" data-act=\"dl\">下载</button></div>\n  </div>`;\n}\nfunction renderResult(r){\n  const box = $('#results');\n  if(r.type==='search'){\n    lastList = r.songs;\n    box.innerHTML = r.songs.length\n      ? `<div class=\"list-head\"><span class=\"l\">搜索「${esc(r.keywords)}」</span><span class=\"r\">${r.songs.length} 首</span></div>` + r.songs.map(s=>songRow(s,0)).join('')\n      : '<div class=\"empty\">没有搜到</div>';\n  } else if(r.type==='song'){ lastList=[r.song]; box.innerHTML = songRow(r.song,0); }\n  else if(r.type==='list'||r.type==='playlist'){\n    lastList = r.songs||[];\n    box.innerHTML = `<div class=\"list-head\"><span class=\"l\">${r.type==='playlist'?esc(r.name):'共 '+lastList.length+' 首'}</span><span class=\"r\">${lastList.length} 首</span></div>`\n      + lastList.map((s,i)=>songRow(s,i+1)).join('');\n  }\n  $$('button[data-act]', box).forEach(b => b.onclick = () => {\n    const row = b.closest('.song'), id = row.dataset.id;\n    const song = lastList.find(x => x.id === id);\n    if(b.dataset.act==='dl') downloadSong(id, b, song ? (song.artists ? song.artists + ' - ' : '') + song.name : ''); else showUrl(id,row,b);\n  });\n}\nfunction dlUrl(id, name){\n  let u = BASE + '?a=download&p='+platform+'&id='+encodeURIComponent(id)+'&level='+encodeURIComponent(level);\n  if(name) u += '&name=' + encodeURIComponent(name);\n  return u;\n}\nfunction triggerDownload(u){ const a=document.createElement('a'); a.href=u; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); }\nfunction downloadSong(id, btn, name){\n  btn.disabled=true; const old=btn.textContent; btn.innerHTML='<span class=\"spin\"></span>';\n  triggerDownload(dlUrl(id, name));\n  toast('已开始下载');\n  setTimeout(()=>{ btn.disabled=false; btn.textContent=old; },1500);\n}\nasync function showUrl(id,row,btn){\n  btn.disabled=true; const old=btn.textContent; btn.textContent='…';\n  try{\n    const r = await api('url',{method:'POST', body: JSON.stringify({id, level})});\n    const line=document.createElement('div');\n    line.className='url-line';\n    line.innerHTML = `${esc(r.label||'')} · ${r.br?Math.round(r.br/1000)+' kbps':''} ${r.size?Math.round(r.size/1048576*10)/10+' MB':''}<br><a href=\"${esc(r.url)}\" target=\"_blank\" rel=\"noopener\">${esc(String(r.url).slice(0,90))}…</a>`;\n    row.after(line);\n    btn.textContent='收起'; btn.disabled=false;\n    btn.onclick = () => { line.remove(); btn.textContent=old; btn.onclick = () => showUrl(id,row,btn); };\n  }catch(e){ setErr(e.message); btn.textContent=old; btn.disabled=false; }\n}\n$('#btnGo').onclick = async () => {\n  const input = $('#q').value.trim();\n  if(!input){ setErr('请输入歌名或链接'); return; }\n  setErr(''); $('#results').innerHTML='<div class=\"empty center\"><span class=\"spin\"></span> 解析中…</div>';\n  $('#btnGo').disabled=true;\n  try{ renderResult(await api('resolve',{method:'POST', body: JSON.stringify({input, level})})); }\n  catch(e){ setErr(e.message); $('#results').innerHTML=''; }\n  $('#btnGo').disabled=false;\n};\n$('#q').addEventListener('keydown', e => { if(e.key==='Enter') $('#btnGo').click(); });\n$$('#plats button').forEach(b => b.onclick = () => {\n  platform = b.dataset.p;\n  localStorage.setItem('m_platform', platform);\n  setErr(''); $('#results').innerHTML=''; lastList=[];\n  clearInterval(pollTimer); pollTimer=null;\n  applyBrand();\n  if(platform==='netease' && !status.netease.loggedIn) startQr();\n});\ndocument.addEventListener('visibilitychange', () => {\n  if(document.hidden){ clearInterval(pollTimer); pollTimer=null; return; }\n  if(platform!=='netease' || status.netease.loggedIn) return;\n  if(!$('#qrFrame').querySelector('svg') && window._qrToken){ check(window._qrToken, 1); pollTimer=setInterval(()=>check(window._qrToken,1),1800); }\n});\napplyBrand();\nrefreshStatus();\n// 刚才为了跳 App 离开过页面的话，回来接着等原来那张\nsetTimeout(() => { if(platform === 'netease' && !status.netease.loggedIn && $('#qrFrame').querySelector('svg')) resumeQr(); }, 600);\n</script>\n</body>\n</html>\n";
