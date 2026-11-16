// Browser-side PDF rendering. Loaded lazily: pdfmake and the fonts are large.
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import notoRegular from "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url";
import notoBold from "@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url";
import notoItalic from "@expo-google-fonts/noto-sans/400Regular_Italic/NotoSans_400Regular_Italic.ttf?url";
import notoBoldItalic from "@expo-google-fonts/noto-sans/700Bold_Italic/NotoSans_700Bold_Italic.ttf?url";
import geoRegular from "@expo-google-fonts/noto-sans-georgian/400Regular/NotoSansGeorgian_400Regular.ttf?url";
import geoBold from "@expo-google-fonts/noto-sans-georgian/700Bold/NotoSansGeorgian_700Bold.ttf?url";
import { PDF_FONTS } from "./pdf";

const FILES: Record<string, string> = {
  "NotoSans-Regular.ttf": notoRegular,
  "NotoSans-Bold.ttf": notoBold,
  "NotoSans-Italic.ttf": notoItalic,
  "NotoSans-BoldItalic.ttf": notoBoldItalic,
  "NotoSansGeorgian-Regular.ttf": geoRegular,
  "NotoSansGeorgian-Bold.ttf": geoBold,
};

async function toBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

let ready: Promise<{ createPdf: (d: TDocumentDefinitions) => { getBlob: () => Promise<Blob> } }> | null = null;

function engine() {
  ready ??= (async () => {
    const mod = await import("pdfmake/build/pdfmake");
    const pdfMake = (mod as unknown as { default: Record<string, unknown> }).default ?? mod;
    const vfs: Record<string, string> = {};
    await Promise.all(Object.entries(FILES).map(async ([name, url]) => (vfs[name] = await toBase64(url))));
    (pdfMake.addVirtualFileSystem as (v: Record<string, string>) => void)(vfs);
    (pdfMake.addFonts as (f: unknown) => void)(PDF_FONTS);
    // No remote resources: images are embedded as data URLs.
    (pdfMake.setUrlAccessPolicy as (cb: (u: string) => boolean) => void)?.(() => false);
    return pdfMake as unknown as { createPdf: (d: TDocumentDefinitions) => { getBlob: () => Promise<Blob> } };
  })();
  return ready;
}

export async function renderPdf(def: TDocumentDefinitions): Promise<Blob> {
  const pdfMake = await engine();
  return pdfMake.createPdf(def).getBlob();
}
