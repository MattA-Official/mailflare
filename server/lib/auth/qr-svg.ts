// qrcode's Node entry also loads its PNG renderer, whose pngjs dependency cannot be initialised on
// Workers ("superCtor.prototype" in util.inherits). Enrolment only needs the SVG string, so this
// goes to qrcode's core and SVG renderer directly. Same output as QRCode.toString(..., { type: "svg" }).
// @ts-expect-error qrcode ships no types for its internal modules
import QRCodeCore from "qrcode/lib/core/qrcode.js";
// @ts-expect-error qrcode ships no types for its internal modules
import SvgTag from "qrcode/lib/renderer/svg-tag.js";

type SvgOptions = { margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" };

export function renderQrSvg(text: string, options: SvgOptions = {}): string {
	const { errorCorrectionLevel, ...renderOptions } = options;
	const qr = QRCodeCore.create(text, { errorCorrectionLevel });
	return SvgTag.render(qr, renderOptions) as string;
}
