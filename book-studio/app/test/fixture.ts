import type { Manuscript } from "../src/export/model";

export function sampleManuscript(overrides: Partial<Manuscript> = {}): Manuscript {
  return {
    org: { name: "Caucasus Flight Academy", brandColor: "#1F3A52", logo: null },
    book: { id: "8a6d2f0e-1111-4222-8333-944455556666", title: "ATO Training Manual", subtitle: "PPL(A) course", documentRef: "TM-01" },
    langs: ["en", "ka"],
    generatedAt: "2026-11-16T10:00:00.000Z",
    includeAuthorship: false,
    revisions: [
      { revision: 0, date: "2026-11-10T09:00:00.000Z", chapterNumber: 1, chapterTitle: "Part A — General", description: "Initial issue" },
    ],
    chapters: [
      {
        number: 1,
        id: "c1",
        title: { en: "Part A — General", ka: "ნაწილი A — ზოგადი" },
        goal: "Set out the manual's purpose.",
        status: "approved",
        revision: 0,
        approvedAt: "2026-11-10T09:00:00.000Z",
        text: {
          en: "This manual sets out how the ATO trains pilots.\n\n## Amendments\n\nAmendments are issued by the Head of Training.\n\n- Review annually\n- Record every change\n\n1. Draft\n2. Review\n3. Approve & issue <now>",
          ka: "ეს სახელმძღვანელო აღწერს, თუ როგორ ამზადებს ATO პილოტებს.\n\n## ცვლილებები\n\nცვლილებებს გამოსცემს სწავლების ხელმძღვანელი (Head of Training).\n\n- ყოველწლიური გადახედვა",
        },
        aiGenerated: { en: false, ka: true },
        sources: [{ title: "Part-ORA", reference: "ORA.ATO.230", url: "" }],
      },
      {
        number: 2,
        id: "c2",
        title: { en: "Part B — Flight Training", ka: "" },
        goal: "",
        status: "draft",
        revision: null,
        approvedAt: null,
        text: { en: "Flight lessons follow the syllabus. [CITATION NEEDED: syllabus reference]", ka: "" },
        aiGenerated: { en: true, ka: false },
        sources: [],
      },
    ],
    ...overrides,
  };
}
