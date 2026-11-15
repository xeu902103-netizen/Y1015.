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

function pickLoginCookie(j) {
  const keep = ['MUSIC_U', '__csrf', 'NMTID', 'os', 'appver'];
  const out = {};
  for (const k of keep) if (j.__cookie && j.__cookie[k]) out[k] = j.__cookie[k];
  return out;
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
  const j = await ncm('song/enhance/player/url/v1', { ids: '[', level, encodeType: 'mp3' }.ids + id + ']', session);
  const d = (j.data && j.data[0]) || {};
  if (d.url) return { url: d.url, type: d.type || 'mp3', br: d.br || 0, size: d.size || 0, level };
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
    url: sip.replace(/\/$/, '') + '/' + info.purl,
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
    url: play, type: (j.extName || 'mp3').toLowerCase(),
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
    if (a === 'status') {
      const out = { netease: { loggedIn: false }, qq: { loggedIn: false }, kg: { loggedIn: false } };
      if (sess.ncm) {
        try { out.netease = await loginStatus(sess.ncm); } catch (e) { out.netease = { loggedIn: true, nickname: '已登录' }; }
      }
      if (sess.qq) out.qq = { loggedIn: true, nickname: qqUin(sess.qq) ? 'QQ ' + qqUin(sess.qq) : '已粘贴 Cookie' };
      if (sess.kg) out.kg = { loggedIn: true, nickname: '已粘贴 Cookie' };
      return json(out);
    }

    if (a === 'login_qr') {
      const k = await ncm('login/qrcode/unikey', { type: 3 });
      const key = k.unikey || '';
      if (!key) return json({ error: '获取二维码失败：' + (k.code || '?') }, 502);
      const link = 'https://music.163.com/login?codekey=' + key;
      const blob = await sealSess({ qr: key, ts: Math.floor(Date.now() / 1000) });
      return json({ token: blob, qrurl: link, svg: qrSvg(link, 4) });
    }

    if (a === 'login_check') {
      const blob = url.searchParams.get('token') || '';
      const st = await openSess(blob);
      if (!st || !st.qr) return json({ code: 800, status: 'expired', error: '二维码已失效，请刷新' });
      const r = await ncm('login/qrcode/client/login', { key: st.qr, type: 3 });
      const code = Number(r.code || 0);
      if (code === 803) {
        const ck = pickLoginCookie(r);
        if (!ck.MUSIC_U) return json({ code: 803, status: 'fail', error: '登录成功但没拿到 Cookie，请刷新重试' });
        const me = { code: 803, status: 'ok', sess: await sealSess({ ncm: ck }) };
        try { Object.assign(me, await loginStatus(ck)); } catch (e) { }
        return json(me);
      }
      if (code === 802) return json({ code: 802, status: 'scanned' });
      if (code === 800 || Math.floor(Date.now() / 1000) - (st.ts || 0) > 900) return json({ code: 800, status: 'expired', error: '二维码已过期，请刷新' });
      return json({ code: 801, status: 'waiting' });
    }

    if (a === 'set_cookie') {
      const body = await req.json();
      const plat = body.platform;
      const ck = String(body.cookie || '').trim().replace(/\s*\n\s*/g, ' ').replace(/\s*;\s*/g, '; ');
      if (plat !== 'qq' && plat !== 'kg') return json({ error: '不支持的平台' }, 400);
      if (!ck) return json({ error: 'Cookie 不能为空' }, 400);
      const next = { ...sess, [plat]: ck };
      const blob = await sealSess(next);
      const out = { ok: true, sess: blob, netease: { loggedIn: !!sess.ncm }, qq: { loggedIn: false }, kg: { loggedIn: false } };
      if (sess.ncm) { try { out.netease = await loginStatus(sess.ncm); } catch (e) { } }
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
      let u;
      if (p === 'qq') u = await qqUrl(id, level, sess.qq);
      else if (p === 'kg') u = await kgUrl(id, level, sess.kg);
      else u = await songUrl(id, level, sess.ncm || {});
      if (!u) return json({ error: '没有可用地址' }, 404);
      // 直接 302 到音乐 CDN，浏览器自己下载（不占用 Worker 流量）
      return Response.redirect(u.url, 302);
    }

    if (a === 'diag') {
      const out = { runtime: 'cloudflare-worker', now: new Date().toISOString() };
      try { out.encoder = typeof qrcode === 'function'; out.svgLen = qrSvg('diag').length; } catch (e) { out.qr_error = String(e); }
      try { const k = await ncm('login/qrcode/unikey', { type: 3 }); out.netease_api = { code: k.code, has_key: !!k.unikey }; } catch (e) { out.netease_api = { error: String(e) }; }
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
    return new Response(PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};

/* ============================================================
 * 页面
 * ============================================================ */
const PAGE = "<!DOCTYPE html>\n<html lang=\"zh-CN\" data-theme=\"auto\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#ff3a3a\">\n<title>音乐下载 · 网易云 / QQ / 酷狗</title>\n<style>\n:root{--bg:#f5f6fa;--bg2:#eceef6;--card:rgba(255,255,255,.88);--fg:#14161c;--sub:#6b7180;--line:rgba(20,22,28,.08);\n--acc:#ff3a3a;--acc2:#ff7a45;--ok:#12a150;--radius:18px;--shadow:0 10px 30px rgba(30,35,60,.08)}\n[data-theme=dark]{--bg:#0e1015;--bg2:#090a0e;--card:rgba(28,31,40,.85);--fg:#eef0f5;--sub:#9aa1b0;--line:rgba(255,255,255,.08);\n--acc:#ff4d4d;--acc2:#ff9052;--ok:#3ddc84;--shadow:0 12px 34px rgba(0,0,0,.45)}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nbody{margin:0;min-height:100vh;color:var(--fg);\nbackground:radial-gradient(1200px 600px at 10% -10%,rgba(255,58,58,.16),transparent 60%),radial-gradient(900px 500px at 110% 10%,rgba(90,120,255,.14),transparent 60%),linear-gradient(180deg,var(--bg),var(--bg2));\nbackground-attachment:fixed;font:15px/1.55 -apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Noto Sans CJK SC\",sans-serif;\npadding:calc(12px + env(safe-area-inset-top)) 14px calc(28px + env(safe-area-inset-bottom))}\n.wrap{max-width:720px;margin:0 auto}\n.top{display:flex;align-items:center;gap:12px;padding:4px 2px 16px}\n.logo{width:44px;height:44px;border-radius:14px;flex:none;display:grid;place-items:center;color:#fff;font-weight:800;font-size:20px;\nbackground:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 8px 20px rgba(255,58,58,.35)}\n.top h1{font-size:18px;margin:0}.top .sub{font-size:12.5px;color:var(--sub)}.top .spacer{flex:1}\n.icon-btn{width:38px;height:38px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:grid;place-items:center;cursor:pointer;font-size:17px}\n.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;margin-bottom:14px;backdrop-filter:blur(16px)}\n.card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px}\n.card-h .t{font-weight:700;display:flex;align-items:center;gap:8px}\n.card-h .t .dot{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 4px rgba(255,58,58,.14)}\n.plats{display:flex;gap:8px;margin-bottom:14px;background:rgba(20,22,28,.05);padding:5px;border-radius:16px}\n[data-theme=dark] .plats{background:rgba(255,255,255,.06)}\n.plats button{flex:1;padding:11px 8px;border-radius:12px;background:transparent;color:var(--sub);border:none;font-weight:650;font-size:14px;cursor:pointer;font-family:inherit}\n.plats button.on{background:var(--card);color:var(--fg);box-shadow:0 4px 14px rgba(0,0,0,.10)}\n.plats .live{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);margin-right:6px;vertical-align:1px;opacity:.25}\n.plats .live.on{opacity:1}\ninput[type=text],textarea{width:100%;font:inherit;color:inherit;padding:13px 14px;border-radius:14px;border:1px solid var(--line);background:rgba(125,125,125,.08);outline:none}\ntextarea{min-height:96px;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;resize:vertical}\ninput:focus,textarea:focus{border-color:var(--acc);box-shadow:0 0 0 4px rgba(255,58,58,.12)}\nbutton{font:inherit;cursor:pointer;border:none;border-radius:14px;padding:13px 18px;font-weight:650;color:#fff;white-space:nowrap;\nbackground:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 8px 18px rgba(255,58,58,.28)}\nbutton:disabled{opacity:.55;box-shadow:none}\nbutton.ghost{background:rgba(125,125,125,.10);color:var(--fg);box-shadow:none;border:1px solid var(--line);font-weight:600}\nbutton.small{padding:8px 12px;font-size:13px;border-radius:11px}\nbutton.tiny{padding:6px 10px;font-size:12px;border-radius:9px}\n.input-row{display:flex;gap:8px}input[type=text]{flex:1;min-width:0}\n.quality{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 14px}\n.quality button{background:rgba(125,125,125,.10);color:var(--sub);border:1px solid var(--line);box-shadow:none;padding:8px 13px;font-size:13px;border-radius:999px}\n.quality button.on{color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));border-color:transparent}\n.qr-frame{position:relative;width:min(340px,86vw,100%);aspect-ratio:1;margin:6px auto 12px;border-radius:22px;background:#fff;padding:10px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.12)}\n.qr-frame svg{position:absolute;inset:10px;width:calc(100% - 20px)!important;height:calc(100% - 20px)!important;display:block;border-radius:12px}\n.qr-overlay{position:absolute;inset:0;display:none;place-items:center;background:rgba(255,255,255,.92);border-radius:22px;color:#222;font-weight:700;font-size:14px}\n.qr-overlay.show{display:grid}\n.qr-hint{color:var(--sub);font-size:13px;text-align:center;min-height:22px}\n.qr-hint b{color:var(--fg)}.qr-hint.ok{color:var(--ok);font-weight:700}\n.steps{display:flex;justify-content:center;gap:6px;margin-top:10px;flex-wrap:wrap}\n.steps span{font-size:11.5px;color:var(--sub);background:rgba(125,125,125,.10);padding:4px 9px;border-radius:999px}\n.song{display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px}\n.song:hover{background:rgba(125,125,125,.06)}\n.song .cover{width:46px;height:46px;border-radius:11px;object-fit:cover;background:rgba(125,125,125,.15);flex:none}\n.song .m{flex:1;min-width:0}\n.song .tt{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.song .dd{color:var(--sub);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.song .acts{display:flex;gap:6px;flex:none}\n.list-head{display:flex;justify-content:space-between;margin:4px 0 10px;gap:10px}\n.list-head .l{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.list-head .r{color:var(--sub);font-size:12.5px}\n.url-line{font-size:12px;color:var(--sub);margin:2px 0 6px 58px;word-break:break-all}\n.url-line a{color:var(--acc);text-decoration:none}\n.empty{color:var(--sub);text-align:center;padding:18px 6px;font-size:13.5px}\n.err{color:var(--acc);font-size:13px;margin-top:10px;background:rgba(255,58,58,.08);padding:10px 12px;border-radius:12px}\n.hide{display:none!important}\n.spin{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:s .7s linear infinite;vertical-align:-2px}\n@keyframes s{to{transform:rotate(360deg)}}\n.center{display:flex;align-items:center;justify-content:center;gap:8px}\n.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translate(-50%,20px);background:rgba(20,22,28,.92);color:#fff;\npadding:10px 16px;border-radius:999px;font-size:13.5px;opacity:0;pointer-events:none;transition:.25s;z-index:9}\n.toast.on{opacity:1;transform:translate(-50%,0)}\n.help{color:var(--sub);font-size:12.5px;line-height:1.75;margin:8px 0 12px}\n.help code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:5px;font-size:12px}\n.foot{text-align:center;color:var(--sub);font-size:11.5px;margin-top:18px;line-height:1.7}\n.user{display:flex;align-items:center;gap:12px}\n.avatar{width:46px;height:46px;border-radius:50%;object-fit:cover;background:rgba(125,125,125,.15);flex:none}\n.user .n{font-weight:700}\n.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,58,58,.12);color:var(--acc);font-weight:700;margin-left:6px}\n.badge.g{background:rgba(18,161,80,.14);color:var(--ok)}\n.modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px}\n.modal.hide{display:none}\n.modal-mask{position:absolute;inset:0;background:rgba(10,12,18,.55)}\n.modal-box{position:relative;width:min(380px,92vw);background:var(--card);border:1px solid var(--line);border-radius:22px;padding:16px;box-shadow:0 24px 60px rgba(0,0,0,.35)}\n.modal-h{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:12px}\n.dtabs{display:flex;gap:8px;background:rgba(125,125,125,.10);padding:4px;border-radius:14px;margin-bottom:12px}\n.dtabs button{flex:1;padding:9px;border-radius:11px;background:transparent;color:var(--sub);box-shadow:none;font-weight:650;font-size:13.5px}\n.dtabs button.on{background:var(--card);color:var(--fg)}\n.helpbox{max-height:56vh;overflow:auto;font-size:13.5px;line-height:1.85}\n.helpbox ol{padding-left:20px}.helpbox code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:5px}\n.helpbox .k{color:var(--acc);font-weight:700}\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <div class=\"top\">\n    <div class=\"logo\" id=\"brandLogo\">♪</div>\n    <div><h1 id=\"brandTitle\">音乐下载</h1><div class=\"sub\" id=\"brandSub\">网易云 / QQ 音乐 / 酷狗</div></div>\n    <div class=\"spacer\"></div>\n    <button class=\"icon-btn\" id=\"btnTheme\" title=\"深浅色\">◐</button>\n  </div>\n\n  <div class=\"plats\" id=\"plats\">\n    <button data-p=\"netease\" class=\"on\"><span class=\"live\" id=\"dot-netease\"></span>网易云</button>\n    <button data-p=\"qq\"><span class=\"live\" id=\"dot-qq\"></span>QQ 音乐</button>\n    <button data-p=\"kg\"><span class=\"live\" id=\"dot-kg\"></span>酷狗</button>\n  </div>\n\n  <div class=\"card\" id=\"qrCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span>扫码登录</div></div>\n    <div class=\"qr-frame\" id=\"qrFrame\"><div class=\"qr-overlay\" id=\"qrOverlay\">二维码已失效</div></div>\n    <div class=\"qr-hint\" id=\"qrHint\">正在生成二维码…</div>\n    <div class=\"steps\"><span>① 打开网易云 App</span><span>② 扫一扫</span><span>③ 确认登录</span></div>\n    <div style=\"display:flex;gap:8px;margin-top:12px\">\n      <button class=\"ghost small\" id=\"btnRefreshQr\" style=\"flex:1\">刷新二维码</button>\n      <button class=\"ghost small\" id=\"btnQrLink\" style=\"flex:1\">显示链接</button>\n    </div>\n    <div class=\"url-line hide\" id=\"qrLink\" style=\"margin-left:0\"></div>\n  </div>\n\n  <div class=\"card hide\" id=\"cookieCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span><span id=\"cookieTitle\">登录</span></div>\n      <button class=\"ghost small\" id=\"btnCookieHelp\">怎么取？</button></div>\n    <div class=\"help\" id=\"cookieHelp\"></div>\n    <textarea id=\"cookieInput\" placeholder=\"粘贴 Cookie，如 uin=o1234567; qm_keyst=xxxx\"></textarea>\n    <div style=\"display:flex;gap:8px;margin-top:10px\">\n      <button id=\"btnSaveCookie\" style=\"flex:1\">保存 Cookie</button>\n      <button class=\"ghost\" id=\"btnClearCookie\">清除</button>\n    </div>\n  </div>\n\n  <div class=\"card hide\" id=\"userCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span>账号</div><button class=\"ghost small\" id=\"btnLogout\">退出</button></div>\n    <div id=\"userBox\"></div>\n  </div>\n\n  <div class=\"card\" id=\"dlCard\">\n    <div class=\"card-h\"><div class=\"t\"><span class=\"dot\"></span>下载</div></div>\n    <div class=\"input-row\"><input id=\"q\" type=\"text\" placeholder=\"粘贴歌曲 / 歌单链接，或输入歌名\" autocomplete=\"off\"><button id=\"btnGo\">搜索</button></div>\n    <div class=\"quality\" id=\"quality\"></div>\n    <div class=\"err hide\" id=\"err\"></div>\n    <div id=\"results\"></div>\n  </div>\n\n  <div class=\"foot\">仅供下载自己有权收听的歌曲 · 登录态只存在你浏览器里</div>\n</div>\n<div class=\"toast\" id=\"toast\"></div>\n\n<div class=\"modal hide\" id=\"helpModal\">\n  <div class=\"modal-mask\" id=\"helpMask\"></div>\n  <div class=\"modal-box\">\n    <div class=\"modal-h\"><span>怎么取 Cookie</span><button class=\"icon-btn\" id=\"helpClose\" style=\"width:32px;height:32px;font-size:15px\">✕</button></div>\n    <div class=\"dtabs\" id=\"htabs\"><button data-k=\"pc\" class=\"on\">电脑</button><button data-k=\"phone\">手机</button></div>\n    <div class=\"helpbox\" id=\"helpBody\"></div>\n  </div>\n</div>\n\n<script>\nconst $ = (s, r = document) => r.querySelector(s);\nconst $$ = (s, r = document) => [...r.querySelectorAll(s)];\nconst BASE = location.pathname;\nlet token = localStorage.getItem('m_token') || '';\nlet sess = localStorage.getItem('m_sess') || '';\nlet platform = localStorage.getItem('m_platform') || 'netease';\nlet level = localStorage.getItem('m_level') || 'exhigh';\nlet lastList = [], pollTimer = null, qrLinkText = '';\nlet status = { netease:{loggedIn:false}, qq:{loggedIn:false}, kg:{loggedIn:false} };\n\nconst P = {\n  netease:{title:'网易云音乐 · 离线下载', sub:'扫码登录 · 按账号权限下载', logo:'♪'},\n  qq:{title:'QQ 音乐 · 离线下载', sub:'粘贴 Cookie · 按账号权限下载', logo:'♫'},\n  kg:{title:'酷狗音乐 · 离线下载', sub:'免费歌曲直接下 · 会员贴 Cookie', logo:'♬'},\n};\nconst LEVELS = {\n  netease:[['standard','标准 128k'],['higher','较高 192k'],['exhigh','极高 320k'],['lossless','无损']],\n  qq:[['standard','标准 128k'],['exhigh','极高 320k'],['lossless','无损 FLAC']],\n  kg:[['standard','标准 128k']],\n};\n\nconst esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst fmtDur = ms => { if(!ms) return ''; const t = Math.round(ms/1000); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); };\nfunction toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),2400); }\nfunction setErr(m){ const e=$('#err'); if(!m){e.classList.add('hide');return;} e.textContent=m; e.classList.remove('hide'); }\n\nfunction authHeaders(base = {}){ const h = {...base}; if(sess) h['X-Sess']=sess; return h; }\nfunction saveSess(b){ if(!b) return; sess=b; localStorage.setItem('m_sess', b); }\n\nasync function api(a, opt = {}){\n  const h = authHeaders({ 'Content-Type':'application/json' });\n  Object.assign(h, opt.headers || {});\n  const sep = '&';\n  const r = await fetch(BASE + '?a=' + a + sep + 'p=' + platform, { ...opt, headers: h });\n  const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));\n  if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status));\n  return j;\n}\n\n/* 主题 */\nfunction resolveTheme(t){ return t==='auto' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : t; }\nfunction applyTheme(t){ document.documentElement.setAttribute('data-theme', resolveTheme(t)); }\nlet theme = localStorage.getItem('m_theme') || 'auto';\napplyTheme(theme);\n$('#btnTheme').onclick = () => { theme = resolveTheme(theme)==='dark'?'light':'dark'; localStorage.setItem('m_theme',theme); applyTheme(theme); };\n\n/* 平台 */\nfunction applyBrand(){\n  const p = P[platform];\n  $('#brandTitle').textContent = p.title;\n  $('#brandSub').textContent = p.sub;\n  $('#brandLogo').textContent = p.logo;\n  $$('#plats button').forEach(b => b.classList.toggle('on', b.dataset.p === platform));\n  ['netease','qq','kg'].forEach(k => $('#dot-'+k).classList.toggle('on', !!(status[k] && status[k].loggedIn)));\n  if(!LEVELS[platform].some(x => x[0] === level)) level = 'exhigh';\n  renderQuality(); refreshUi();\n}\nfunction refreshUi(){\n  const logged = !!(status[platform] && status[platform].loggedIn);\n  const isQr = platform === 'netease';\n  $('#qrCard').classList.toggle('hide', !(isQr && !logged));\n  $('#cookieCard').classList.toggle('hide', isQr || logged);\n  $('#userCard').classList.toggle('hide', !logged);\n  if(!isQr && !logged){\n    $('#cookieTitle').textContent = platform === 'qq' ? '登录 QQ 音乐' : '登录酷狗（可选）';\n    $('#cookieHelp').innerHTML = platform === 'qq'\n      ? 'QQ 音乐没有可用的网页扫码接口，需要粘贴 Cookie（含 <code>uin=</code> 和 <code>qm_keyst=</code>）。'\n      : '不贴 Cookie 也能下免费歌曲；会员/付费歌曲需要登录后的 Cookie（含 <code>userid=</code>、<code>token=</code>）。';\n  }\n  if(logged){\n    const me = status[platform];\n    $('#userBox').innerHTML = `<div class=\"user\">\n      ${me.avatar?`<img class=\"avatar\" src=\"${esc(me.avatar)}\" alt=\"\">`:`<div class=\"avatar\" style=\"display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2))\">${esc((me.nickname||'?').slice(0,1))}</div>`}\n      <div><div class=\"n\">${esc(me.nickname||'已登录')}<span class=\"badge ${me.vip?'':'g'}\">${me.vip?'VIP':'普通'}</span></div>\n      <div class=\"help\" style=\"margin:0\">${esc(P[platform].title.split(' · ')[0])}</div></div></div>`;\n  }\n  $('#q').placeholder = platform==='qq' ? '粘贴 QQ 音乐歌曲 / 歌单链接，或输入歌名'\n    : platform==='kg' ? '粘贴酷狗歌曲链接，或输入歌名' : '粘贴网易云歌曲 / 歌单链接，或输入歌名';\n}\nfunction renderQuality(){\n  $('#quality').innerHTML = LEVELS[platform].map(([k,l]) => `<button data-lv=\"${k}\" class=\"${k===level?'on':''}\">${l}</button>`).join('');\n  $$('#quality button').forEach(b => b.onclick = () => { level=b.dataset.lv; localStorage.setItem('m_level',level); renderQuality(); });\n}\n\n/* 登录状态 */\nasync function refreshStatus(){\n  try {\n    const j = await fetch(BASE + '?a=status', { headers: authHeaders(), cache:'no-store' }).then(r => r.json());\n    status = j;\n  } catch(e){}\n  applyBrand();\n  if(platform==='netease' && !status.netease.loggedIn) startQr();\n}\n\n/* 扫码 */\nfunction paintQr(svg){\n  const f = $('#qrFrame');\n  [...f.querySelectorAll('svg')].forEach(n => n.remove());\n  f.classList.remove('hide');\n  if(!svg) return false;\n  f.insertAdjacentHTML('afterbegin', svg);\n  return true;\n}\nfunction setOverlay(show){\n  const o = $('#qrOverlay');\n  o.classList.toggle('show', !!show);\n  o.classList.toggle('hide', !show);\n}\nasync function startQr(){\n  clearInterval(pollTimer); pollTimer = null;\n  [...$('#qrFrame').querySelectorAll('svg')].forEach(n => n.remove());\n  setOverlay(false);\n  $('#qrHint').innerHTML = '<span class=\"spin\"></span> 正在生成二维码…';\n  try{\n    const r = await api('login_qr');\n    paintQr(r.svg);\n    qrLinkText = r.qrurl || '';\n    if(!r.svg){ $('#qrHint').textContent = '二维码生成失败，点刷新重试'; setOverlay(true); return; }\n    $('#qrHint').innerHTML = '用手机<b>网易云音乐</b>扫一扫，然后在手机上点「确认登录」';\n    window._qrToken = r.token;\n    let ticks = 0;\n    pollTimer = setInterval(() => { ticks++; check(tok(r.token), ticks); }, 1800);\n    check(tok(r.token), 0);\n  }catch(e){\n    $('#qrHint').textContent = '生成失败：' + e.message;\n    setOverlay(true);\n  }\n}\nfunction tok(t){ window._qrToken = t; return t; }\nasync function check(t, ticks){\n  if(!t) return;\n  try{\n    const j = await fetch(BASE + '?a=login_check&p=' + platform + '&token=' + encodeURIComponent(t), { cache:'no-store' }).then(r=>r.json());\n    if(j.status === 'scanned'){ $('#qrHint').textContent = '已扫码，请在手机上点「确认登录」'; setOverlay(true); }\n    else if(j.status === 'ok'){\n      clearInterval(pollTimer); pollTimer = null;\n      saveSess(j.sess);\n      $('#qrHint').innerHTML = '<span style=\"color:var(--ok);font-weight:700\">登录成功 ✓</span>';\n      setOverlay(false);\n      toast('登录成功');\n      setTimeout(refreshStatus, 400);\n    }\n    else if(j.status === 'expired' || j.status === 'fail'){\n      clearInterval(pollTimer); pollTimer = null;\n      $('#qrHint').textContent = j.error || '二维码已失效，点刷新';\n      setOverlay(true);\n    }\n    else if(ticks && ticks % 6 === 0){ $('#qrHint').textContent = '仍在等待扫码…（15 分钟内有效）'; }\n  }catch(e){}\n}\n$('#btnRefreshQr').onclick = startQr;\n$('#btnQrLink').onclick = () => { const l=$('#qrLink'); l.classList.toggle('hide'); l.innerHTML = `<a href=\"${esc(qrLinkText)}\">${esc(qrLinkText)}</a>`; };\n\n/* Cookie */\n$('#btnSaveCookie').onclick = async () => {\n  const ck = $('#cookieInput').value.trim();\n  if(!ck){ setErr('请先粘贴 Cookie'); return; }\n  setErr('');\n  const btn=$('#btnSaveCookie'); btn.disabled=true; const old=btn.textContent; btn.innerHTML='<span class=\"spin\"></span>';\n  try{\n    const r = await fetch(BASE + '?a=set_cookie&p=' + platform, { method:'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ platform, cookie: ck }) });\n    const j = await r.json();\n    if(!r.ok) throw new Error(j.error || '保存失败');\n    saveSess(j.sess);\n    status = j;\n    $('#cookieInput').value='';\n    toast('Cookie 已保存');\n    applyBrand();\n  }catch(e){ setErr(e.message); }\n  btn.disabled=false; btn.textContent=old;\n};\n$('#btnClearCookie').onclick = async () => {\n  try{\n    const r = await fetch(BASE + '?a=clear_cookie&p=' + platform, { method:'POST', headers: authHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ platform }) });\n    const j = await r.json(); saveSess(j.sess);\n  }catch(e){}\n  status[platform] = { loggedIn:false };\n  applyBrand(); toast('已清除');\n};\n$('#btnLogout').onclick = async () => {\n  clearInterval(pollTimer); pollTimer = null;\n  try{ const j = await api('logout'); saveSess(j.sess); }catch(e){}\n  status[platform] = { loggedIn:false };\n  if(platform==='netease'){ sess=''; localStorage.removeItem('m_sess'); }\n  applyBrand();\n};\n\n/* 教程 */\nconst HELP = {\n  pc:`<b>电脑 Chrome / Edge</b><ol><li>打开 y.qq.com 或 www.kugou.com 并登录</li><li>按 <code>F12</code> → <b>Network</b></li><li>刷新页面，点第一条请求</li><li>Request Headers → <b>Cookie</b>，整行复制</li><li>回本页粘贴保存</li></ol>\n  <div class=\"help\">只要两段也行：QQ 是 <span class=\"k\">uin=</span> + <span class=\"k\">qm_keyst=</span>；酷狗是 <span class=\"k\">userid=</span> + <span class=\"k\">token=</span></div>`,\n  phone:`<b>手机 Android</b><ol><li>装 <b>Kiwi Browser</b> 或狐猴浏览器</li><li>用它打开官网并登录</li><li>右上角 ⋮ → 开发者工具 → Network</li><li>刷新 → 点第一条请求 → Request Headers → Cookie，长按复制</li><li>回本页粘贴保存</li></ol>\n  <div class=\"help\">iPhone 建议用电脑取一次再发到手机粘贴。</div>`,\n};\nfunction renderHelp(k){ $('#helpBody').innerHTML = HELP[k]||HELP.pc; $$('#htabs button').forEach(b=>b.classList.toggle('on', b.dataset.k===k)); }\n$('#btnCookieHelp').onclick = () => { $('#helpModal').classList.remove('hide'); renderHelp('pc'); };\n$('#helpClose').onclick = $('#helpMask').onclick = () => $('#helpModal').classList.add('hide');\n$$('#htabs button').forEach(b => b.onclick = () => renderHelp(b.dataset.k));\n\n/* 搜索/列表 */\nfunction songRow(s, i){\n  return `<div class=\"song\" data-id=\"${esc(s.id)}\">\n    ${i?`<span class=\"help\" style=\"width:20px;text-align:center;margin:0\">${i}</span>`:''}\n    <img class=\"cover\" src=\"${esc(s.pic)}\" alt=\"\" loading=\"lazy\" onerror=\"this.style.visibility='hidden'\">\n    <div class=\"m\"><div class=\"tt\">${esc(s.name)}</div><div class=\"dd\">${esc(s.artists)}${s.album?' · '+esc(s.album):''}${s.duration?' · '+fmtDur(s.duration):''}</div></div>\n    <div class=\"acts\"><button class=\"ghost tiny\" data-act=\"url\">地址</button><button class=\"tiny\" data-act=\"dl\">下载</button></div>\n  </div>`;\n}\nfunction renderResult(r){\n  const box = $('#results');\n  if(r.type==='search'){\n    lastList = r.songs;\n    box.innerHTML = r.songs.length\n      ? `<div class=\"list-head\"><span class=\"l\">搜索「${esc(r.keywords)}」</span><span class=\"r\">${r.songs.length} 首</span></div>` + r.songs.map(s=>songRow(s,0)).join('')\n      : '<div class=\"empty\">没有搜到</div>';\n  } else if(r.type==='song'){ lastList=[r.song]; box.innerHTML = songRow(r.song,0); }\n  else if(r.type==='list'||r.type==='playlist'){\n    lastList = r.songs||[];\n    box.innerHTML = `<div class=\"list-head\"><span class=\"l\">${r.type==='playlist'?esc(r.name):'共 '+lastList.length+' 首'}</span><span class=\"r\">${lastList.length} 首</span></div>`\n      + lastList.map((s,i)=>songRow(s,i+1)).join('');\n  }\n  $$('button[data-act]', box).forEach(b => b.onclick = () => {\n    const row = b.closest('.song'), id = row.dataset.id;\n    if(b.dataset.act==='dl') downloadSong(id,b); else showUrl(id,row,b);\n  });\n}\nfunction dlUrl(id){ return BASE + '?a=download&p='+platform+'&id='+encodeURIComponent(id)+'&level='+encodeURIComponent(level); }\nfunction triggerDownload(u){ const a=document.createElement('a'); a.href=u; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); }\nfunction downloadSong(id, btn){\n  btn.disabled=true; const old=btn.textContent; btn.innerHTML='<span class=\"spin\"></span>';\n  triggerDownload(dlUrl(id));\n  toast('已开始下载');\n  setTimeout(()=>{ btn.disabled=false; btn.textContent=old; },1500);\n}\nasync function showUrl(id,row,btn){\n  btn.disabled=true; const old=btn.textContent; btn.textContent='…';\n  try{\n    const r = await api('url',{method:'POST', body: JSON.stringify({id, level})});\n    const line=document.createElement('div');\n    line.className='url-line';\n    line.innerHTML = `${esc(r.label||'')} · ${r.br?Math.round(r.br/1000)+' kbps':''} ${r.size?Math.round(r.size/1048576*10)/10+' MB':''}<br><a href=\"${esc(r.url)}\" target=\"_blank\" rel=\"noopener\">${esc(String(r.url).slice(0,90))}…</a>`;\n    row.after(line);\n    btn.textContent='收起'; btn.disabled=false;\n    btn.onclick = () => { line.remove(); btn.textContent=old; btn.onclick = () => showUrl(id,row,btn); };\n  }catch(e){ setErr(e.message); btn.textContent=old; btn.disabled=false; }\n}\n$('#btnGo').onclick = async () => {\n  const input = $('#q').value.trim();\n  if(!input){ setErr('请输入歌名或链接'); return; }\n  setErr(''); $('#results').innerHTML='<div class=\"empty center\"><span class=\"spin\"></span> 解析中…</div>';\n  $('#btnGo').disabled=true;\n  try{ renderResult(await api('resolve',{method:'POST', body: JSON.stringify({input, level})})); }\n  catch(e){ setErr(e.message); $('#results').innerHTML=''; }\n  $('#btnGo').disabled=false;\n};\n$('#q').addEventListener('keydown', e => { if(e.key==='Enter') $('#btnGo').click(); });\n$$('#plats button').forEach(b => b.onclick = () => {\n  platform = b.dataset.p;\n  localStorage.setItem('m_platform', platform);\n  setErr(''); $('#results').innerHTML=''; lastList=[];\n  clearInterval(pollTimer); pollTimer=null;\n  applyBrand();\n  if(platform==='netease' && !status.netease.loggedIn) startQr();\n});\ndocument.addEventListener('visibilitychange', () => {\n  if(document.hidden){ clearInterval(pollTimer); pollTimer=null; return; }\n  if(platform!=='netease' || status.netease.loggedIn) return;\n  if(!$('#qrFrame').querySelector('svg') && window._qrToken){ check(window._qrToken, 1); pollTimer=setInterval(()=>check(window._qrToken,1),1800); }\n});\napplyBrand();\nrefreshStatus();\n</script>\n</body>\n</html>\n";
