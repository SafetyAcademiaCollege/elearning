// Pre-written sample content for the demo. Nothing here comes from a real AI call.
import type { Lang } from "../types";

export function sampleChapterText(title: string, goal: string, lang: Lang): string {
  if (lang === "ka") {
    return `ეს თავი, „${title}“, განკუთვნილია მსმენელებისა და ინსტრუქტორებისთვის. მისი მიზანია, რომ მკითხველმა გაიგოს ძირითადი პრინციპები და შეძლოს მათი გამოყენება ყოველდღიურ პრაქტიკაში.

## ძირითადი საკითხები

უსაფრთხოება იწყება მომზადებით. ყოველი ფრენის ან სამუშაოს წინ საჭიროა საფრთხეების იდენტიფიკაცია და რისკის შეფასება. ინსტრუქტორი ამოწმებს, რომ მსმენელს ესმის არა მხოლოდ რა უნდა გააკეთოს, არამედ რატომ.

- გადაამოწმეთ ამინდი და გარემო პირობები
- შეაფასეთ საკუთარი მზადყოფნა და დაღლილობა
- განსაზღვრეთ წინასწარ, როდის შეწყვეტთ ოპერაციას

## პრაქტიკული გამოყენება

ორგანიზაციამ უნდა დაადგინოს მკაფიო კრიტერიუმები გადაწყვეტილების მისაღებად. ეს კრიტერიუმები ეფუძნება მოქმედ რეგულაციას [CITATION NEEDED: შესაბამისი მოთხოვნის მითითება] და ორგანიზაციის საკუთარ გამოცდილებას.

შეჯამება: უსაფრთხო გადაწყვეტილება წინასწარ დაგეგმილი გადაწყვეტილებაა.`;
  }
  return `This chapter, "${title}", is written for trainees and instructors. ${goal ? goal + " " : ""}By the end of it the reader should understand the core principles and be able to apply them in day-to-day operations.

## Key principles

Safety starts before the engine does. Every flight or task begins with identifying hazards and assessing the risk they carry. The instructor's job is to make sure the trainee understands not only what to do, but why it matters.

- Check the weather and the operating environment against your personal minimums
- Assess your own readiness, including fatigue and workload
- Decide in advance the point at which you will stop or turn back

## Applying it in practice

The organisation sets clear decision criteria so that nobody has to invent them under pressure. These criteria rest on the applicable regulation [CITATION NEEDED: reference to the specific requirement] and on the organisation's own occurrence data.

1. Brief the criteria before the activity
2. Monitor them during the activity
3. Debrief honestly afterwards, including near misses

In short: a safe decision is one that was planned before it was needed.`;
}

export const SAMPLE_FLAGS: Record<Lang, { type: string; note: string }[]> = {
  en: [
    { type: "Needs citation", note: "“personal minimums” are introduced without saying where the organisation defines them; link the relevant SOP or source." },
    { type: "Terminology", note: "The text uses both “turn back” and “divert”; pick the term in your glossary and use it consistently." },
    { type: "Clarity", note: "The numbered list mixes actions and outcomes; start each item with a verb so trainees can follow it as a procedure." },
  ],
  ka: [
    { type: "Needs citation", note: "„მოქმედ რეგულაციას“ არ ახლავს კონკრეტული მითითება; მიუთითეთ წყარო ბიბლიოთეკიდან." },
    { type: "Terminology", note: "ტერმინი „რისკის შეფასება“ შეადარეთ გლოსარიუმს და გამოიყენეთ ერთნაირად მთელ თავში." },
  ],
};

export const SAMPLE_SUGGESTIONS: Record<Lang, { type: string; note: string }[]> = {
  en: [
    { type: "Structure", note: "Open with a short real-world scenario, then state the learning objective; trainees remember the principle better when they first see why it matters." },
    { type: "Missing topic", note: "The goal mentions decision-making, but the text doesn't cover how fatigue degrades it. Add a section on recognising fatigue in yourself and others." },
    { type: "Accuracy", note: "Where you describe weather minima, check them against the source linked to this chapter and state which rule they come from." },
    { type: "Audience", note: "Some sentences assume instructor-level knowledge. Define terms like “workload management” at first use for ab-initio trainees." },
  ],
  ka: [
    { type: "Structure", note: "დაიწყეთ მოკლე რეალური მაგალითით, შემდეგ ჩამოაყალიბეთ სწავლის მიზანი." },
    { type: "Missing topic", note: "მიზანი ეხება გადაწყვეტილების მიღებას, მაგრამ დაღლილობის გავლენა არ არის განხილული; დაამატეთ ცალკე ნაწილი." },
    { type: "Terminology", note: "ტერმინები შეადარეთ ორგანიზაციის გლოსარიუმს და გამოიყენეთ ერთნაირად." },
  ],
};

export const SAMPLE_BLUEPRINT = [
  { title_en: "Human Factors and the HFACS Model", title_ka: "ადამიანური ფაქტორები და HFACS მოდელი", goal: "Show trainees how the HFACS framework explains most light-aircraft accidents as decision failures rather than mechanical ones." },
  { title_en: "Cognitive Bias in the Cockpit", title_ka: "კოგნიტური მიკერძოება კაბინაში", goal: "Help pilots recognise confirmation bias and plan-continuation bias before they shape a go/no-go decision." },
  { title_en: "Energy Management", title_ka: "ენერგიის მართვა", goal: "Explain total energy state as the common physics behind stall/spin, unstable approaches and runway excursions." },
  { title_en: "Mountain and VFR-into-IMC Threats", title_ka: "მთიანი რელიეფი და VFR-დან IMC-ში შესვლის საფრთხეები", goal: "Prepare pilots for the specific environmental threats of operating in the Caucasus." },
];
