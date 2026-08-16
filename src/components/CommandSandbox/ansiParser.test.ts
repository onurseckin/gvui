import { describe, expect, it } from "bun:test";
import { formatRgbColor, get256Color, parseAnsi, stripAnsi } from "../../engine/sandbox/ansiParser";

describe("ansiParser Unit Tests", () => {
  describe("stripAnsi", () => {
    it("strips standard ANSI color codes and resets", () => {
      const input = "\x1b[31mRed Text\x1b[0m and \x1b[32mGreen Text\x1b[0m";
      expect(stripAnsi(input)).toBe("Red Text and Green Text");
    });

    it("strips TrueColor and 256-color codes", () => {
      const input = "\x1b[38;2;255;100;50mRGB Color\x1b[0m \x1b[48;5;120mBG Color\x1b[0m";
      expect(stripAnsi(input)).toBe("RGB Color BG Color");
    });

    it("normalizes CRLF and CR line endings", () => {
      const input = "Line 1\r\nLine 2\rLine 3";
      expect(stripAnsi(input)).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  describe("get256Color and formatRgbColor", () => {
    it("maps standard and bright colors", () => {
      expect(get256Color(1)).toBe("#ef4444"); // Standard red
      expect(get256Color(9)).toBe("#f87171"); // Bright red
    });

    it("maps 6x6x6 color cube", () => {
      const hex = get256Color(16); // Black in 6x6x6
      expect(hex).toBe("#000000");
      const hexWhite = get256Color(231);
      expect(hexWhite).toBe("#ffffff");
    });

    it("formats clamped RGB CSS colors", () => {
      expect(formatRgbColor(255, 128, 0)).toBe("rgb(255, 128, 0)");
      expect(formatRgbColor(300, -20, 50.4)).toBe("rgb(255, 0, 50)");
    });
  });

  describe("parseAnsi", () => {
    it("parses plain text without ANSI codes", () => {
      const res = parseAnsi("Hello world\nSecond line");
      expect(res.hasAnsi).toBe(false);
      expect(res.lines.length).toBe(2);
      expect(res.lines[0]!.plainText).toBe("Hello world");
      expect(res.lines[1]!.plainText).toBe("Second line");
    });

    it("parses standard text attributes (bold, italic, underline, dim, strikethrough)", () => {
      const input =
        "\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m \x1b[4mUnderline\x1b[0m \x1b[2mDim\x1b[0m \x1b[9mCrossed\x1b[0m";
      const res = parseAnsi(input);
      expect(res.hasAnsi).toBe(true);
      expect(res.lines.length).toBe(1);

      const spans = res.lines[0]!.spans;
      const boldSpan = spans.find((s) => s.text === "Bold");
      expect(boldSpan?.style.bold).toBe(true);

      const italicSpan = spans.find((s) => s.text === "Italic");
      expect(italicSpan?.style.italic).toBe(true);

      const underlineSpan = spans.find((s) => s.text === "Underline");
      expect(underlineSpan?.style.underline).toBe(true);

      const dimSpan = spans.find((s) => s.text === "Dim");
      expect(dimSpan?.style.dim).toBe(true);

      const strikeSpan = spans.find((s) => s.text === "Crossed");
      expect(strikeSpan?.style.strikethrough).toBe(true);
    });

    it("parses FG & BG color combinations and 24-bit TrueColor", () => {
      const input = "\x1b[31;42mRed on Green\x1b[0m \x1b[38;2;120;200;255mSky TrueColor\x1b[0m";
      const res = parseAnsi(input);
      expect(res.hasAnsi).toBe(true);

      const spans = res.lines[0]!.spans;
      const redOnGreen = spans.find((s) => s.text === "Red on Green");
      expect(redOnGreen?.style.color).toBe("#ef4444");
      expect(redOnGreen?.style.bgColor).toBe("#10b981");

      const trueColor = spans.find((s) => s.text === "Sky TrueColor");
      expect(trueColor?.style.color).toBe("rgb(120, 200, 255)");
    });

    it("tracks line numbers and streams", () => {
      const input = "Line A\nLine B\nLine C";
      const res = parseAnsi(input, "stderr", 45);
      expect(res.lines.length).toBe(3);
      expect(res.lines[0]!.lineNumber).toBe(1);
      expect(res.lines[0]!.stream).toBe("stderr");
      expect(res.lines[0]!.timestampMs).toBe(45);
      expect(res.lines[2]!.lineNumber).toBe(3);
    });
  });
});
