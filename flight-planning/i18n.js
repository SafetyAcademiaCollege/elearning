// Georgian interface layer for the flight computer.
// Translates rendered text only — calculations, saved data and the ICAO flight
// plan values (filed with ATC in English) are never touched. Default language is
// Georgian; the header switch stores the choice on this device.
(function () {
  "use strict";
  var LANG = "ka";
  try { LANG = localStorage.getItem("fpLang") || "ka"; } catch (e) {}
  document.documentElement.lang = LANG;

  function addSwitch() {
    var header = document.querySelector("header");
    if (!header) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lang-switch";
    b.setAttribute("data-no-i18n", "");
    b.textContent = LANG === "ka" ? "EN" : "ქარ";
    b.title = LANG === "ka" ? "Switch to English" : "ქართულზე გადართვა";
    b.addEventListener("click", function () {
      try { localStorage.setItem("fpLang", LANG === "ka" ? "en" : "ka"); } catch (e) {}
      location.reload();
    });
    header.insertBefore(b, header.firstChild);
  }
  addSwitch();
  if (LANG !== "ka") return;

  var D = {
 "OCC Flight Planning · Live Recalculation": "OCC ფრენის დაგეგმვა · ავტომატური გადათვლა",
 "ULA and Light Aircraft Flight Computer": "ULA და მსუბუქი საჰაერო ხომალდების ფრენის კალკულატორი",
 "· each leg takes its own wind, temperature and QNH — legs, fuel and runway margins recalculate below. Runway lengths and ATS frequencies are fixed reference data and never change. Base field is Saguramo (private airstrip, pre-certification) — distinct from the nearby AIP-registered Natakhtari field.": "· ყოველ მონაკვეთს აქვს საკუთარი ქარი, ტემპერატურა და QNH — მონაკვეთები, საწვავი და ასაფრენ-დასაფრენი ზოლის მარაგები ქვემოთ ავტომატურად გადაითვლება. ზოლების სიგრძე და ATS სიხშირეები ფიქსირებული საცნობარო მონაცემებია და არ იცვლება. საბაზო აეროდრომია საგურამო (კერძო ასაფრენი მოედანი, სერტიფიცირების პროცესში) — არ აურიოთ ახლომდებარე, AIP-ში რეგისტრირებულ ნატახტრის აეროდრომში.",
 "User Guide ↗": "სახელმძღვანელო (ინგლ.) ↗",
 "Route 1 · via Kutaisi": "მარშრუტი 1 · ქუთაისის გავლით",
 "Route 2 · via Ambrolauri": "მარშრუტი 2 · ამბროლაურის გავლით",
 "Route 3 · Direct (high terrain)": "მარშრუტი 3 · პირდაპირი (მაღალი რელიეფი)",
 "Custom Route": "საკუთარი მარშრუტი",
 "Local Flight": "ადგილობრივი ფრენა",
 "Performance Check": "მახასიათებლების შემოწმება",
 "Fuel Planning": "საწვავის დაგეგმვა",
 "Flight Plan": "ფრენის გეგმა",
 "Airport & Waypoint Identifiers": "აეროდრომებისა და მარშრუტის წერტილების ინდექსები",
 "UGAK is a working identifier for Saguramo, not yet AIP-assigned — do not confuse with UGSA, which is Natakhtari's real, AIP-published code.": "UGAK საგურამოს სამუშაო ინდექსია და ჯერ AIP-ით მინიჭებული არ არის — არ აურიოთ UGSA-ში, რომელიც ნატახტრის რეალური, AIP-ში გამოქვეყნებული კოდია.",
 "Departure Date & Weather Briefing": "გაფრენის თარიღი და მეტეოინფორმაცია",
 "Departure date": "გაფრენის თარიღი",
 "Briefing valid/obtained (UTC)": "მეტეოინფორმაციის მიღების/მოქმედების დრო (UTC)",
 "Weather source": "მეტეოინფორმაციის წყარო",
 "Weather briefing notes": "მეტეოინფორმაციის შენიშვნები",
 "This is a static tool with no live weather feed — setting the date does not fetch conditions automatically. It sets Item 18's DOF on the Flight Plan tab. For real forecast conditions, tell Claude the date and route in chat; it will research current/forecast weather (METAR/TAF where available, otherwise nearest-station and model proxies for Saguramo/Ambrolauri/Mestia) and you enter the resulting figures into Leg Winds and Fuel Planning's OAT/QNH.": "ეს სტატიკური ხელსაწყოა, ცოცხალი მეტეომონაცემების გარეშე — თარიღის მითითება ამინდის პირობებს ავტომატურად არ იღებს. თარიღი ავსებს ფრენის გეგმის Item 18-ის DOF ველს. რეალური პროგნოზისთვის გამოიყენეთ ოფიციალური წყაროები (METAR/TAF, სადაც ხელმისაწვდომია; სხვა შემთხვევაში — უახლოესი სადგურის მონაცემები და პროგნოზული მოდელები საგურამოს/ამბროლაურის/მესტიისთვის), შემდეგ მიღებული მაჩვენებლები შეიყვანეთ „მონაკვეთების ქარებსა“ და საწვავის დაგეგმვის OAT/QNH ველებში. საეჭვო შემთხვევაში მიმართეთ ინსტრუქტორს.",
 "Aircraft": "საჰაერო ხომალდი",
 "select · configure below": "აირჩიეთ · ქვემოთ დააკონფიგურირეთ",
 "Empty weight (kg)": "ცარიელი მასა (კგ)",
 "MTOW (kg)": "MTOW (კგ)",
 "Vy — best rate of climb (km/h)": "Vy — აღმასვლის საუკეთესო სიჩქარე (კმ/სთ)",
 "Climb rate, sea level (ft/min)": "აღმასვლის ვერტიკალური სიჩქარე, ზღვის დონე (ფტ/წთ)",
 "TO ground roll (m)": "აფრენის გარბენი (მ)",
 "TO distance over 15 m (m)": "აფრენის მანძილი 15 მ-მდე (მ)",
 "LDG ground roll (m)": "დაფრენის გარბენი (მ)",
 "LDG distance over 15 m (m)": "დაფრენის მანძილი 15 მ-დან (მ)",
 "Max demonstrated crosswind (km/h)": "მაქს. დემონსტრირებული გვერდითი ქარი (კმ/სთ)",
 "Tank 1 capacity (L)": "ავზი 1-ის ტევადობა (ლ)",
 "Tank 2 capacity (L, 0 if none)": "ავზი 2-ის ტევადობა (ლ, 0 თუ არ არის)",
 "Economy TAS (km/h)": "ეკონომიური TAS (კმ/სთ)",
 "Economy burn (L/h)": "ეკონომიური ხარჯი (ლ/სთ)",
 "Normal TAS (km/h)": "ნორმალური TAS (კმ/სთ)",
 "Normal burn (L/h)": "ნორმალური ხარჯი (ლ/სთ)",
 "Conservative TAS (km/h)": "კონსერვატიული TAS (კმ/სთ)",
 "Conservative burn (L/h)": "კონსერვატიული ხარჯი (ლ/სთ)",
 "Build Route": "მარშრუტის აწყობა",
 "select waypoints in order": "აირჩიეთ წერტილები თანმიმდევრობით",
 "+ Add waypoint": "+ წერტილის დამატება",
 "Mirror return leg": "დაბრუნების მონაკვეთის არეკვლა",
 "Clear": "გასუფთავება",
 "Course and distance for each leg are great-circle (straight-line) figures computed from each field's published ARP — accurate enough between lowland fields, but not a substitute for a charted route through mountains. Any leg touching Mestia (UGMS) needs real valley/pass routing and will otherwise understate distance, time and fuel — cross-check against Route 3's own BT/ALI corridor or a real chart before trusting a custom Mestia leg. \"Mirror return leg\" appends the reverse of the current sequence, for a quick out-and-back nav log — for filing, build and file each direction as its own one-way custom route rather than one mirrored sequence.": "თითოეული მონაკვეთის კურსი და მანძილი დიდი წრის (სწორხაზოვანი) მაჩვენებლებია, გამოთვლილი აეროდრომების გამოქვეყნებული ARP-დან — საკმარისად ზუსტია დაბლობის აეროდრომებს შორის, მაგრამ მთებში რუკაზე დატანილ მარშრუტს ვერ ჩაანაცვლებს. მესტიასთან (UGMS) დაკავშირებულ ნებისმიერ მონაკვეთს ხეობებითა და უღელტეხილებით გავლა სჭირდება, წინააღმდეგ შემთხვევაში მანძილი, დრო და საწვავი შემცირებული იქნება — მესტიის საკუთარ მონაკვეთს ენდეთ მხოლოდ მარშრუტი 3-ის BT/ALI დერეფანთან ან რეალურ რუკასთან შედარების შემდეგ. „დაბრუნების მონაკვეთის არეკვლა“ მიმდინარე თანმიმდევრობას შებრუნებულს უმატებს, სწრაფი წასვლა-დაბრუნების სანავიგაციო ჟურნალისთვის — გეგმის წარსადგენად კი თითოეული მიმართულება ცალკე, ცალმხრივ მარშრუტად ააწყვეთ და წარადგინეთ.",
 "Local Flight Setup": "ადგილობრივი ფრენის პარამეტრები",
 "Base aerodrome (departure = destination)": "საბაზო აეროდრომი (გაფრენა = დანიშნულება)",
 "Planned local flight duration (minutes)": "ადგილობრივი ფრენის დაგეგმილი ხანგრძლივობა (წუთი)",
 "A local flight has no point-to-point distance, so time and fuel are computed directly from this planned duration and the Fuel Planning tab's power setting, rather than from distance and groundspeed. Departure and destination are both filed as this same aerodrome. Set the wind for the movement below in Leg Winds — it applies to both the takeoff and the landing performance cards.": "ადგილობრივ ფრენას წერტილიდან წერტილამდე მანძილი არ აქვს, ამიტომ დრო და საწვავი პირდაპირ ამ დაგეგმილი ხანგრძლივობიდან და საწვავის დაგეგმვის ჩანართის ძრავის რეჟიმიდან ითვლება, და არა მანძილიდან და მიწის სიჩქარიდან. გაფრენისა და დანიშნულების აეროდრომად ერთი და იგივე აეროდრომი ფიქსირდება. ქარი მიუთითეთ ქვემოთ, „მონაკვეთების ქარებში“ — ის ვრცელდება როგორც აფრენის, ისე დაფრენის მახასიათებლების ბარათებზე.",
 "Leg Winds": "მონაკვეთების ქარები",
 "Leg": "მონაკვეთი",
 "Dir °T": "მიმ. °T",
 "Wind FROM direction and speed (km/h), set independently for each leg — mountain legs (e.g. into Mestia) often differ sharply from valley legs.": "ქარის მიმართულება (საიდანაც უბერავს) და სიჩქარე (კმ/სთ), თითოეული მონაკვეთისთვის ცალ-ცალკე — მთის მონაკვეთებზე (მაგ. მესტიისკენ) ქარი ხშირად მკვეთრად განსხვავდება ხეობის მონაკვეთებისგან.",
 "Conditions": "პირობები",
 "OAT at field (°C)": "OAT აეროდრომზე (°C)",
 "QNH (hPa)": "QNH (ჰპა)",
 "Sea-level-reference temperature and pressure, applied route-wide; each aerodrome's own density altitude is derived from its elevation and the ISA lapse rate.": "ზღვის დონის საცნობარო ტემპერატურა და წნევა, მთელ მარშრუტზე; თითოეული აეროდრომის სიმკვრივითი სიმაღლე მისი აბსოლუტური სიმაღლიდან და ISA-ს ტემპერატურული გრადიენტიდან ითვლება.",
 "Cruise": "საკრეისერო რეჟიმი",
 "Power setting": "ძრავის რეჟიმი",
 "Economy — 150 km/h, 10.5 L/h (book)": "ეკონომიური — 150 კმ/სთ, 10.5 ლ/სთ (სახელმძღვანელოთი)",
 "Normal — 175 km/h, 13.0 L/h (book)": "ნორმალური — 175 კმ/სთ, 13.0 ლ/სთ (სახელმძღვანელოთი)",
 "Conservative real-world — 165 km/h, ~19.5 L/h": "კონსერვატიული (რეალური) — 165 კმ/სთ, ~19.5 ლ/სთ",
 "Custom": "საკუთარი",
 "TAS (km/h)": "TAS (კმ/სთ)",
 "Burn (L/h)": "ხარჯი (ლ/სთ)",
 "Aircraft & Load": "საჰაერო ხომალდი და დატვირთვა",
 "Pilot (kg)": "პილოტი (კგ)",
 "Baggage (kg)": "ბარგი (კგ)",
 "Passenger on board": "ბორტზე მგზავრია",
 "Passenger (kg)": "მგზავრი (კგ)",
 "Fuel tanks": "საწვავის ავზები",
 "Standard — 88 L usable": "სტანდარტული — 88 ლ გამოსაყენებელი",
 "Optional — 112 L usable": "დამატებითი — 112 ლ გამოსაყენებელი",
 "Fuel on board (L)": "საწვავი ბორტზე (ლ)",
 "Alternate / Diversion Fields": "სათადარიგო აეროდრომები",
 "extensible": "გაფართოებადი",
 "Wind dir (°T)": "ქარის მიმ. (°T)",
 "Wind speed (km/h)": "ქარის სიჩქარე (კმ/სთ)",
 "Independent check — not tied to a specific leg. One set of conditions evaluated against every candidate alternate at once (Telavi, Natakhtari, Kutaisi, Ambrolauri, Batumi, Tbilisi), compared side by side on the right. More fields are added here as their AIP data is researched; runway/frequency data itself is fixed once entered.": "დამოუკიდებელი შემოწმება — არ არის მიბმული კონკრეტულ მონაკვეთზე. პირობების ერთი ნაკრები ერთდროულად ფასდება ყველა სათადარიგო აეროდრომისთვის (თელავი, ნატახტარი, ქუთაისი, ამბროლაური, ბათუმი, თბილისი) და შედეგები მარჯვნივ, გვერდიგვერდ ჩანს. ახალი აეროდრომები დაემატება მათი AIP-მონაცემების დამუშავების შემდეგ; ზოლისა და სიხშირის მონაცემები შეყვანის შემდეგ ფიქსირებულია.",
 "Takeoff Airfield": "აფრენის აეროდრომი",
 "Field": "აეროდრომი",
 "Landing Airport": "დაფრენის აეროდრომი",
 "Route": "მარშრუტი",
 "Route 1 · via Kutaisi (612 km)": "მარშრუტი 1 · ქუთაისის გავლით (612 კმ)",
 "Route 2 · via Ambrolauri (537 km)": "მარშრუტი 2 · ამბროლაურის გავლით (537 კმ)",
 "Route 3 · Direct, high terrain (227 km)": "მარშრუტი 3 · პირდაპირი, მაღალი რელიეფი (227 კმ)",
 "Custom route (current sequence)": "საკუთარი მარშრუტი (მიმდინარე თანმიმდევრობა)",
 "Local flight (same field)": "ადგილობრივი ფრენა (იგივე აეროდრომი)",
 "Reserve": "მარაგი",
 "45 min (VFR day-reserve guideline)": "45 წთ (VFR დღის მარაგის რეკომენდაცია)",
 "30 min (marginal threshold)": "30 წთ (ზღვრული მნიშვნელობა)",
 "60 min": "60 წთ",
 "Reserve (min)": "მარაგი (წთ)",
 "Uses the leg winds and route-wide OAT/QNH currently entered on that route's own tab (Route 1 / Route 2) — switch tabs to adjust per-leg wind or conditions; this page doesn't duplicate that input.": "იყენებს იმ მონაკვეთების ქარებს და მარშრუტის OAT/QNH-ს, რომლებიც ამ მარშრუტის საკუთარ ჩანართზეა შეყვანილი (მარშრუტი 1 / მარშრუტი 2) — მონაკვეთის ქარის ან პირობების შესაცვლელად გადადით იმ ჩანართზე; ეს გვერდი მათ არ იმეორებს.",
 "Aircraft & Equipment Profile": "საჰაერო ხომალდისა და აღჭურვილობის პროფილი",
 "saved, reused every flight": "ინახება, გამოიყენება ყოველ ფრენაზე",
 "Type designator": "ტიპის აღნიშვნა",
 "Wake category": "კვალის ტურბულენტობის კატეგორია",
 "L — Light": "L — მსუბუქი",
 "M — Medium": "M — საშუალო",
 "H — Heavy": "H — მძიმე",
 "COM/NAV equipment": "COM/NAV აღჭურვილობა",
 "Surveillance (SSR)": "მეთვალყურეობა (SSR)",
 "Callsign (Item 7, ICAO field form)": "სამოძახო ნიშანი (Item 7, ICAO ფორმა)",
 "Registration": "რეგისტრაცია",
 "Aircraft colour & markings": "საჰაერო ხომალდის ფერი და მარკირება",
 "Life jackets": "სამაშველო ჟილეტები",
 "None carried": "არ არის ბორტზე",
 "L — light fluorescein": "L — მსუბუქი ფლუორესცეინი",
 "F — fluorescein": "F — ფლუორესცეინი",
 "U — UHF equipped": "U — UHF აღჭურვილობით",
 "V — VHF equipped": "V — VHF აღჭურვილობით",
 "Dinghies": "სამაშველო ნავები",
 "Emergency radio / ELT": "ავარიული რადიოშუქურა / ELT",
 "E — ELT carried": "E — ELT ბორტზეა",
 "Equipment codes confirmed against 03-AKA's actual installed avionics (GCAA aircraft-station-license application, Annexes 8 & 9, filed 26 Mar 2026): VHF — TRIG TY91 + TRIG GTR225 (8.33 kHz channel spacing) → code V+Y; Transponder — TRIG TT21, Mode S with altitude and aircraft-identification reporting, no extended squitter/ADS-B Out, 24-bit address 5140E5 → code S. No VOR or ILS receiver is fitted, hence no O/L codes. GPS onboard is a": "აღჭურვილობის კოდები შემოწმებულია 03-AKA-ზე რეალურად დამონტაჟებულ ავიონიკასთან (GCAA-ში წარდგენილი საჰაერო ხომალდის რადიოსადგურის ლიცენზიის განაცხადი, დანართები 8 და 9, 26.03.2026): VHF — TRIG TY91 + TRIG GTR225 (8.33 kHz არხების ბიჯი) → კოდი V+Y; ტრანსპონდერი — TRIG TT21, Mode S სიმაღლისა და საჰაერო ხომალდის იდენტიფიკაციის გადაცემით, extended squitter/ADS-B Out-ის გარეშე, 24-ბიტიანი მისამართი 5140E5 → კოდი S. VOR ან ILS მიმღები დამონტაჟებული არ არის, ამიტომ O/L კოდები არ არის. ბორტზე არსებული GPS",
 "portable": "პორტატული",
 "unit, not installed/certified aircraft equipment — per ICAO convention the \"G\" (GNSS) code is reserved for a permanently installed, certified GNSS receiver integrated with the aircraft, so it is correctly omitted from Item 10a; carrying a portable GPS does not change the filed equipment code. ELT — ARTEX ELT-345 (survival equipment, reflected in Item 19 below, not Item 10). Survival-gear details (jackets/dinghies) remain placeholders — verify against the aircraft itself. Saved on this device with your other inputs.": "მოწყობილობაა და არა დამონტაჟებული/სერტიფიცირებული აღჭურვილობა — ICAO-ს წესით „G“ (GNSS) კოდი მხოლოდ მუდმივად დამონტაჟებულ, სერტიფიცირებულ GNSS მიმღებს ეკუთვნის, ამიტომ ის Item 10a-ში სწორად არ არის მითითებული; პორტატული GPS-ის ტარება წარდგენილ კოდს არ ცვლის. ELT — ARTEX ELT-345 (სამაშველო აღჭურვილობა, აისახება Item 19-ში, არა Item 10-ში). სამაშველო აღჭურვილობის დეტალები (ჟილეტები/ნავები) ჯერ ნიმუშის მნიშვნელობებია — გადაამოწმეთ თავად საჰაერო ხომალდზე. ინახება ამ მოწყობილობაზე, სხვა შეყვანილ მონაცემებთან ერთად.",
 "Flight Details": "ფრენის დეტალები",
 "Route 3 · Direct, high terrain": "მარშრუტი 3 · პირდაპირი, მაღალი რელიეფი",
 "Custom route (filed exactly as built)": "საკუთარი მარშრუტი (წარდგება ზუსტად როგორც აწყობილია)",
 "Local flight (departure = destination)": "ადგილობრივი ფრენა (გაფრენა = დანიშნულება)",
 "Pilot-in-command": "მეთაური პილოტი (PIC)",
 "Persons on board": "ბორტზე მყოფი პირები",
 "Date of flight (UTC)": "ფრენის თარიღი (UTC)",
 "Cruising level": "საკრეისერო დონე",
 "Alternate aerodrome": "სათადარიგო აეროდრომი",
 "Other information / remarks": "სხვა ინფორმაცია / შენიშვნები",
 "Speed, burn, endurance and total EET below use the Fuel Planning tab's current power setting and this route's leg winds/conditions — switch tabs to adjust those; this page doesn't duplicate that input.": "ქვემოთ მოცემული სიჩქარე, ხარჯი, ხანგრძლივობა და ჯამური EET იყენებს საწვავის დაგეგმვის ჩანართის მიმდინარე ძრავის რეჟიმს და ამ მარშრუტის მონაკვეთების ქარებს/პირობებს — მათ შესაცვლელად გადადით შესაბამის ჩანართზე; ეს გვერდი მათ არ იმეორებს.",
 "Weight & Balance": "მასა და ცენტრირება",
 "Total weight": "ჯამური მასა",
 "Margin to MTOW": "მარაგი MTOW-მდე",
 "Status": "სტატუსი",
 "Legs — Route 1": "მონაკვეთები — მარშრუტი 1",
 "Wind": "ქარი",
 "Hdg": "HDG",
 "Dist.": "მანძ.",
 "Time": "დრო",
 "Fuel": "საწვავი",
 "Fuel Status": "საწვავის სტატუსი",
 "Fuel used": "გამოყენებული საწვავი",
 "Fuel remaining": "დარჩენილი საწვავი",
 "Reserve time": "მარაგის დრო",
 "Threshold: 45 min = typical VFR day-reserve guideline, 30–45 min = marginal, <30 min = not flyable. Georgia's AIP (ENR 1.10) states no VFR reserve minimum of its own — this guideline is not a regulatory figure.": "ზღვარი: 45 წთ = VFR დღის მარაგის ტიპური რეკომენდაცია, 30–45 წთ = ზღვრული, <30 წთ = ფრენა დაუშვებელია. საქართველოს AIP (ENR 1.10) VFR საწვავის მინიმალურ მარაგს არ ადგენს — ეს რეკომენდაცია ნორმატიული მაჩვენებელი არ არის.",
 "Aerodrome Performance — Per Movement": "აეროდრომზე მახასიათებლები — თითოეული მოძრაობისთვის",
 "Each departure and arrival is calculated with its own leg's wind. Takeoff/landing distance and climb rate use the reference-POH sea-level figures corrected by a standard +10%/1,000 ft density-altitude rule of thumb (−10%/1,000 ft for climb rate) — an approximation, not the actual airframe-379 altitude chart. Runway choice picks whichever fixed direction gives the lower crosswind component for that movement's wind, except Saguramo and Mestia, which are fixed one-way fields regardless of wind (Saguramo: land RWY09 upslope, depart RWY27 downslope; Mestia: land RWY02 upslope, depart RWY20 downslope). Both are gravity-favorable by design — this tool shows the slope but takes no distance credit for it, so real usable margin may be better than shown. Saguramo's runway dimensions and elevation are provisional/unsurveyed pending GCAA certification — treat with extra caution. Runway lengths and ATS frequencies below are fixed AIP or operator reference data — only the selected direction and the DA-corrected numbers respond to your inputs.": "ყოველი აფრენა და დაფრენა საკუთარი მონაკვეთის ქარით ითვლება. აფრენის/დაფრენის მანძილი და აღმასვლის სიჩქარე ეფუძნება საცნობარო POH-ის ზღვის დონის მაჩვენებლებს, შესწორებულს სიმკვრივითი სიმაღლის სტანდარტული პრაქტიკული წესით: +10% ყოველ 1,000 ფუტზე (აღმასვლისთვის −10%) — ეს მიახლოებაა და არა 379-ე საჰაერო ხომალდის რეალური სიმაღლის გრაფიკი. ზოლის მიმართულება ირჩევა ის, რომელზეც ამ მოძრაობის ქარის გვერდითი მდგენელი ნაკლებია, გარდა საგურამოსა და მესტიისა, რომლებიც ქარის მიუხედავად ფიქსირებული ცალმხრივი აეროდრომებია (საგურამო: დაფრენა RWY09 აღმართზე, აფრენა RWY27 დაღმართზე; მესტია: დაფრენა RWY02 აღმართზე, აფრენა RWY20 დაღმართზე). ორივე ქანობი სასარგებლოა — ხელსაწყო ქანობს აჩვენებს, მაგრამ მანძილის შემცირებას არ ითვალისწინებს, ამიტომ რეალური მარაგი შეიძლება ნაჩვენებზე უკეთესი იყოს. საგურამოს ზოლის ზომები და სიმაღლე წინასწარია, აზომვის გარეშე, GCAA-ს სერტიფიცირებამდე — მოეპყარით განსაკუთრებული სიფრთხილით. ქვემოთ მოცემული ზოლების სიგრძე და ATS სიხშირეები AIP-ის ან ოპერატორის ფიქსირებული საცნობარო მონაცემებია — თქვენს შეყვანილ მონაცემებზე რეაგირებს მხოლოდ არჩეული მიმართულება და DA-შესწორებული რიცხვები.",
 "Alternate Field Performance": "სათადარიგო აეროდრომების მახასიათებლები",
 "From Saguramo": "საგურამოდან",
 "Runway": "ზოლი",
 "TO dist / TORA": "აფრ. მანძ. / TORA",
 "LDG dist / LDA": "დაფრ. მანძ. / LDA",
 "Climb": "აღმასვლა",
 "Xwind": "გვერდ. ქარი",
 "All six candidates evaluated under the single wind/OAT/QNH set entered on the left, using the same DA-corrected reference-POH method as the route performance cards. Status flags whichever check (takeoff distance, landing distance, or crosswind) is worst for that field; \"tight\" means under 15% distance margin or under 5 km/h crosswind margin. ATS: Telavi TWR 120.00 (PPR + flight plan required) · Natakhtari Traffic 131.750 self-announce (no ATS unit; separate operator) · Kutaisi TWR 125.500 / APP 127.100 (Class C CTR) · Ambrolauri AFIS 119.850 · Batumi TWR 118.600 / APP 124.425 (Class C CTR, H24, international — confirm PPR/slot) · Tbilisi TWR 119.000 / APP 134.600 (Class C, H24, international hub — confirm PPR/slot).": "ექვსივე აეროდრომი ფასდება მარცხნივ შეყვანილი ერთი და იგივე ქარით/OAT/QNH-ით, მარშრუტის მახასიათებლების ბარათების იმავე DA-შესწორებული POH მეთოდით. სტატუსი აჩვენებს ყველაზე ცუდ შემოწმებას (აფრენის მანძილი, დაფრენის მანძილი ან გვერდითი ქარი); „ზღვრული“ ნიშნავს მანძილის მარაგს 15%-ზე ნაკლებს ან გვერდითი ქარის მარაგს 5 კმ/სთ-ზე ნაკლებს. ATS: თელავი TWR 120.00 (საჭიროა PPR + ფრენის გეგმა) · ნატახტარი Traffic 131.750, თვითგანცხადება (ATS ერთეულის გარეშე; სხვა ოპერატორი) · ქუთაისი TWR 125.500 / APP 127.100 (Class C CTR) · ამბროლაური AFIS 119.850 · ბათუმი TWR 118.600 / APP 124.425 (Class C CTR, H24, საერთაშორისო — დააზუსტეთ PPR/სლოტი) · თბილისი TWR 119.000 / APP 134.600 (Class C, H24, საერთაშორისო ჰაბი — დააზუსტეთ PPR/სლოტი).",
 "Performance Evaluation": "მახასიათებლების შეფასება",
 "Same method as the route tabs: reference-POH sea-level figures corrected by a standard +10%/1,000 ft density-altitude rule of thumb (−10%/1,000 ft for climb) — an approximation, not the actual airframe-379 altitude chart. Fixed one-way fields (Saguramo, Mestia) show their runway slope but take no distance credit for it, even though both are gravity-favorable by design. Saguramo's figures are provisional/unsurveyed pending GCAA certification. Runway lengths and ATS frequencies are fixed AIP or operator reference data; only the selected direction and the DA-corrected numbers respond to your inputs.": "იგივე მეთოდი, რაც მარშრუტის ჩანართებზე: საცნობარო POH-ის ზღვის დონის მაჩვენებლები, შესწორებული სიმკვრივითი სიმაღლის სტანდარტული წესით +10% ყოველ 1,000 ფუტზე (აღმასვლისთვის −10%) — მიახლოებაა და არა 379-ე საჰაერო ხომალდის რეალური სიმაღლის გრაფიკი. ფიქსირებული ცალმხრივი აეროდრომები (საგურამო, მესტია) აჩვენებენ ზოლის ქანობს, მაგრამ მანძილის შემცირება არ ითვლება, თუმცა ორივე ქანობი სასარგებლოა. საგურამოს მონაცემები წინასწარია, აზომვის გარეშე, GCAA-ს სერტიფიცირებამდე. ზოლების სიგრძე და ATS სიხშირეები AIP-ის ან ოპერატორის ფიქსირებული საცნობარო მონაცემებია; თქვენს მონაცემებზე რეაგირებს მხოლოდ არჩეული მიმართულება და DA-შესწორებული რიცხვები.",
 "Fuel Requirement —": "საწვავის მოთხოვნა —",
 "Route 1": "მარშრუტი 1",
 "Trip time": "ფრენის დრო",
 "Trip fuel": "საწვავი ფრენისთვის",
 "Reserve fuel": "სარეზერვო საწვავი",
 "Minimum fuel required": "საჭირო მინიმალური საწვავი",
 "Margin Against Tanks": "მარაგი ავზების მიხედვით",
 "Tank": "ავზი",
 "Capacity": "ტევადობა",
 "Margin over minimum": "მარაგი მინიმუმზე მეტი",
 "Endurance": "ხანგრძლივობა",
 "Endurance is total usable fuel ÷ burn rate, at this page's power setting — not the same as range with reserve; use the minimum-fuel figure above for dispatch planning. Fuel weight assumed 0.72 kg/L. This is trip fuel plus reserve only — no contingency or alternate/diversion fuel is added here.": "ხანგრძლივობა = მთლიანი გამოსაყენებელი საწვავი ÷ ხარჯი, ამ გვერდის ძრავის რეჟიმზე — ეს არ არის მანძილი მარაგის გათვალისწინებით; ფრენის დაგეგმვისთვის გამოიყენეთ ზემოთ მოცემული მინიმალური საწვავი. საწვავის სიმკვრივე — 0.72 კგ/ლ. ეს მხოლოდ ფრენის საწვავი და მარაგია — გაუთვალისწინებელი შემთხვევების ან სათადარიგო აეროდრომისკენ გადასვლის საწვავი არ ემატება.",
 "ICAO Flight Plan —": "ICAO ფრენის გეგმა —",
 "copy text": "ტექსტის კოპირება",
 "Value": "მნიშვნელობა",
 "Formatted as the standard ICAO flight plan Items 7–19, for manual filing by phone/radio/email to Sakaeronavigatsia ATFM — this is a readable form, not a validated AFTN telegraphic message. Item 9's type designator, Item 10's equipment/surveillance codes, and Item 19's survival-equipment codes are placeholders and have not been confirmed against this airframe's actual fit; many light sport types have no assigned ICAO type designator at all, in which case ZZZZ plus the type spelled out in Item 18 remarks is the standard fallback. Verify every field against current requirements before filing — this tool does not submit anything on its own.": "ფორმატირებულია ICAO-ს სტანდარტული ფრენის გეგმის Items 7–19-ის მიხედვით, „საქაერონავიგაციის“ ATFM-ში ტელეფონით/რადიოთი/ელფოსტით ხელით წარსადგენად — ეს ადვილად წასაკითხი ფორმაა და არა შემოწმებული AFTN შეტყობინება. Item 9-ის ტიპის აღნიშვნა, Item 10-ის აღჭურვილობის/მეთვალყურეობის კოდები და Item 19-ის სამაშველო აღჭურვილობის კოდები ნიმუშის მნიშვნელობებია; ბევრ მსუბუქ სპორტულ ტიპს ICAO-ს ტიპის აღნიშვნა საერთოდ არ აქვს — ასეთ შემთხვევაში სტანდარტულია ZZZZ და ტიპის სრული დასახელება Item 18-ის შენიშვნებში. წარდგენამდე ყველა ველი გადაამოწმეთ მოქმედ მოთხოვნებთან — ხელსაწყო თავად არაფერს წარადგენს. ფრენის გეგმის მნიშვნელობები ინგლისურად რჩება, რადგან ასე წარედგინება ATC-ს.",
 "Route 1/2/3: outbound leg only (departure → destination) — file the return separately. Custom route: filed exactly as built, first waypoint to last — for a round trip, build and file the outbound and return as two separate custom sequences rather than one mirrored one. Total EET and endurance use this route's current leg winds/conditions and the Fuel Planning tab's power setting.": "მარშრუტი 1/2/3: მხოლოდ წასვლის მონაკვეთი (გაფრენა → დანიშნულება) — დაბრუნება ცალკე წარადგინეთ. საკუთარი მარშრუტი: წარდგება ზუსტად როგორც აწყობილია, პირველი წერტილიდან ბოლომდე — წასვლა-დაბრუნებისთვის ააწყვეთ და წარადგინეთ ორი ცალკე თანმიმდევრობა. ჯამური EET და ხანგრძლივობა იყენებს ამ მარშრუტის მიმდინარე ქარებს/პირობებს და საწვავის დაგეგმვის ჩანართის ძრავის რეჟიმს.",
 "User Guide": "სახელმძღვანელო (ინგლ.)",
 "— every tab and function explained, kept in step with this tool's version.": "— ყველა ჩანართი და ფუნქცია, ხელსაწყოს ვერსიასთან შესაბამისობაში.",
 "Data consistent with the full written briefings:": "მონაცემები შეესაბამება სრულ წერილობით ბრიფინგებს:",
 "Route 1 briefing": "მარშრუტი 1-ის ბრიფინგი",
 "and": "და",
 "Route 2 briefing": "მარშრუტი 2-ის ბრიფინგი",
 "— those Google Docs still show the pre-correction figures (Saguramo/Natakhtari conflated as one field); this tool has the corrected data. Kutaisi, Ambrolauri, Telavi (UGGT), Natakhtari and Batumi (UGSB) data sourced from AIP Georgia AD 2, AIRAC effective 09 Jul 2026; Saguramo data from the operator's AFOM draft (unsurveyed, pre-certification) and confirmed operational parameters. Natakhtari and Batumi distance/bearing from Saguramo are great-circle figures computed from each field's published ARP, not AIP-declared route legs. Planning tool only, generic-exercise figures throughout — not a substitute for the current AIP, NOTAMs, actual METAR/TAF, or the airframe's own POH before an actual flight. Route 3's waypoints (Sakadagiano, Agara, BT/ALI) and leg geometry come from an AirNavigation-generated navigation log (uploaded 24 Sep 2026); course/distance were converted from that log's NM/magnetic-course figures into this tool's km/course convention, and all time/fuel/climb numbers were recomputed using this project's own aircraft performance model rather than the log's generic placeholder figures (110 kt IAS, 41.7 L/h). Route 3 crosses notably higher terrain than Routes 1–2 — the source log calls for a transit altitude up to 11,200 ft between BT/ALI and Ambrolauri, well above this tool's simplified per-leg climb model (which uses 7,100 ft at BT/ALI and cannot represent a climb-then-descend \"hump\" within one leg). At this airframe's modest climb rate, reaching 11,200 ft in the distance available is marginal at best — verify actual climb performance and current MSA/terrain charts before relying on this routing; do not treat the tool's Route 3 numbers as a certified terrain-clearance profile. Your last-used inputs are remembered on this device only.": "— ამ Google Docs დოკუმენტებში ჯერ კიდევ ძველი მაჩვენებლებია (საგურამო და ნატახტარი ერთ აეროდრომადაა აღრეული); ამ ხელსაწყოში შესწორებული მონაცემებია. ქუთაისის, ამბროლაურის, თელავის (UGGT), ნატახტრისა და ბათუმის (UGSB) მონაცემები აღებულია საქართველოს AIP AD 2-დან, AIRAC 09.07.2026; საგურამოს მონაცემები — ოპერატორის AFOM-ის პროექტიდან (აზომვის გარეშე, სერტიფიცირებამდე) და დადასტურებული საოპერაციო პარამეტრებიდან. ნატახტრისა და ბათუმის მანძილი/აზიმუტი საგურამოდან დიდი წრის მაჩვენებლებია, გამოთვლილი გამოქვეყნებული ARP-დან, და არა AIP-ით დადგენილი მარშრუტის მონაკვეთები. მხოლოდ დაგეგმვის ხელსაწყოა, სასწავლო მაჩვენებლებით — რეალურ ფრენამდე ვერ ჩაანაცვლებს მოქმედ AIP-ს, NOTAM-ებს, ფაქტობრივ METAR/TAF-ს და საჰაერო ხომალდის საკუთარ POH-ს. მარშრუტი 3-ის წერტილები (საკადაგიანო, აგარა, BT/ALI) და მონაკვეთების გეომეტრია აღებულია AirNavigation-ით გენერირებული სანავიგაციო ჟურნალიდან (ატვირთულია 24.09.2026); კურსი/მანძილი გადაყვანილია ამ ხელსაწყოს კმ/კურსის ფორმატში, ხოლო დრო/საწვავი/აღმასვლა ხელახლაა გამოთვლილი პროექტის საკუთარი მახასიათებლების მოდელით და არა ჟურნალის ზოგადი მნიშვნელობებით (110 kt IAS, 41.7 ლ/სთ). მარშრუტი 3 მარშრუტებზე 1–2 მნიშვნელოვნად მაღალ რელიეფზე გადის — წყარო-ჟურნალი BT/ALI-სა და ამბროლაურს შორის 11,200 ფუტამდე სიმაღლეს ითხოვს, რაც ბევრად აღემატება ამ ხელსაწყოს გამარტივებულ აღმასვლის მოდელს (BT/ALI-ზე 7,100 ფუტი; ერთ მონაკვეთში აღმასვლა-დაშვების „კეხს“ ვერ ასახავს). ამ საჰაერო ხომალდის ზომიერი აღმასვლის სიჩქარით 11,200 ფუტის მიღწევა ხელმისაწვდომ მანძილზე, საუკეთესო შემთხვევაში, ზღვრულია — ამ მარშრუტს ენდეთ მხოლოდ რეალური აღმასვლის მახასიათებლებისა და მოქმედი MSA/რელიეფის რუკების გადამოწმების შემდეგ; მარშრუტი 3-ის რიცხვები რელიეფზე გადაფრენის სერტიფიცირებულ პროფილად არ განიხილოთ. ბოლოს შეყვანილი მონაცემები მხოლოდ ამ მოწყობილობაზე ინახება.",
 "e.g. METAR/TAF, Windy, Mountain-Forecast — ask Claude to research this date's forecast": "მაგ. METAR/TAF, Windy, Mountain-Forecast",
 "Summary of forecast winds/OAT/QNH used for this flight — paste here once researched, then enter the actual figures into the Leg Winds and route-wide conditions fields below": "ამ ფრენისთვის გამოყენებული პროგნოზული ქარების/OAT/QNH-ის მოკლე აღწერა — შემდეგ ფაქტობრივი მაჩვენებლები შეიყვანეთ ქვემოთ, მონაკვეთების ქარებსა და მარშრუტის პირობებში",
 "e.g. 03-AKA": "მაგ. 03-AKA",
 "e.g. white/blue, registration on tail": "მაგ. თეთრი/ლურჯი, რეგისტრაცია კუდზე",
 "number/capacity/colour": "რაოდენობა/ტევადობა/ფერი",
 "e.g. VFR / 4500 ft": "მაგ. VFR / 4500 ft",
 "e.g. private VFR training flight": "მაგ. კერძო VFR სასწავლო ფრენა",
 "km/h": "კმ/სთ"
};
  var EXTRA = {
    "Saguramo (private airstrip — pre-certification)": "საგურამო (კერძო ასაფრენი მოედანი — სერტიფიცირებამდე)",
    "Saguramo": "საგურამო", "Natakhtari": "ნატახტარი", "Kutaisi": "ქუთაისი", "Mestia": "მესტია",
    "Ambrolauri": "ამბროლაური", "Telavi": "თელავი",
    "Batumi International": "ბათუმის საერთაშორისო", "Tbilisi International": "თბილისის საერთაშორისო",
    "Sakadagiano (en-route waypoint, not a landing field)": "საკადაგიანო (მარშრუტის წერტილი, არა აეროდრომი)",
    "Agara (en-route waypoint, not a landing field)": "აგარა (მარშრუტის წერტილი, არა აეროდრომი)",
    "BT / ALI (en-route waypoint, not a landing field)": "BT / ALI (მარშრუტის წერტილი, არა აეროდრომი)",
    "Sakadagiano": "საკადაგიანო", "Agara": "აგარა",
    "Private, uncertified — GCAA certification in process, not yet AIP-listed; no published ATS frequency; coordinate via Sakaeronavigatsia ATFM / NOTAM; traffic coordination required with Natakhtari (~4 km NW)":
      "კერძო, არასერტიფიცირებული — GCAA-ს სერტიფიცირება მიმდინარეობს, AIP-ში ჯერ არ არის; გამოქვეყნებული ATS სიხშირე არ აქვს; კოორდინაცია „საქაერონავიგაციის“ ATFM / NOTAM-ის მეშვეობით; აუცილებელია მოძრაობის კოორდინაცია ნატახტართან (~4 კმ ჩრდ.-დას.)",
    "Natakhtari Traffic 131.750 MHz — self-announce, no ATS unit (Class G ATZ, 2 NM radius, GND–1,000 ft AGL)":
      "Natakhtari Traffic 131.750 MHz — თვითგანცხადება, ATS ერთეულის გარეშე (Class G ATZ, რადიუსი 2 NM, GND–1,000 ft AGL)",
    "Kutaisi TWR 125.500 / APP 127.100 — Class C CTR, GND–1,500 ft, 6 NM radius":
      "Kutaisi TWR 125.500 / APP 127.100 — Class C CTR, GND–1,500 ft, რადიუსი 6 NM",
    "Mestia AFIS 121.100 — “Mestia Information,” 0400–1440 UTC (0800–1840 local)":
      "Mestia AFIS 121.100 — „Mestia Information“, 0400–1440 UTC (0800–1840 ადგილობრივი)",
    "Ambrolauri AFIS 119.850 — “Ambrolauri Information,” 0400–1440 UTC (0800–1840 local)":
      "Ambrolauri AFIS 119.850 — „Ambrolauri Information“, 0400–1440 UTC (0800–1840 ადგილობრივი)",
    "Telavi TWR 120.00 — PPR + flight plan + two-way radio required, MON–FRI 0500–1400 (hours as published; confirm UTC/local via NOTAM)":
      "Telavi TWR 120.00 — საჭიროა PPR + ფრენის გეგმა + ორმხრივი რადიოკავშირი, ორშ–პარ 0500–1400 (გამოქვეყნებული საათები; UTC/ადგილობრივი დააზუსტეთ NOTAM-ით)",
    "Batumi TWR 118.600 / APP 124.425 — Class C CTR, H24; ATIS 129.500. Major international/scheduled-traffic airport — confirm PPR, slot and customs/immigration requirements (if crossing a FIR/border routing) for light VFR traffic before filing.":
      "Batumi TWR 118.600 / APP 124.425 — Class C CTR, H24; ATIS 129.500. დიდი საერთაშორისო/რეგულარული მოძრაობის აეროპორტი — მსუბუქი VFR ფრენისთვის გეგმის წარდგენამდე დააზუსტეთ PPR, სლოტი და საბაჟო/საიმიგრაციო მოთხოვნები (FIR-ის/საზღვრის გადაკვეთისას).",
    "Tbilisi TWR 119.000 (sec. 128.000) / APP 134.600 — Class C, H24; ATIS 132.800; Tbilisi Information 124.150. Major international/scheduled-traffic hub — confirm PPR, slot and light-GA access procedure before filing; RWY 13L/31R closed, only 13R/31L (3,000×45 m concrete/asphalt) active.":
      "Tbilisi TWR 119.000 (სათ. 128.000) / APP 134.600 — Class C, H24; ATIS 132.800; Tbilisi Information 124.150. დიდი საერთაშორისო ჰაბი — წარდგენამდე დააზუსტეთ PPR, სლოტი და მსუბუქი GA-სთვის დაშვების პროცედურა; RWY 13L/31R დახურულია, მოქმედებს მხოლოდ 13R/31L (3,000×45 მ ბეტონი/ასფალტი).",
    "ok": "ნორმა", "tight": "ზღვრული", "marginal": "ზღვრული", "over mtow": "MTOW გადაჭარბებულია",
    "not flyable": "ფრენა დაუშვებელია", "insufficient runway": "ზოლი არასაკმარისია",
    "crosswind exceeded": "გვერდითი ქარი გადაჭარბებულია", "insufficient": "არასაკმარისი",
    "Runway used": "გამოყენებული ზოლი", "Density altitude": "სიმკვრივითი სიმაღლე", "Runway slope": "ზოლის ქანობი",
    "TO dist. (15 m) / TORA": "აფრ. მანძ. (15 მ) / TORA", "LDG dist. (15 m) / LDA": "დაფრ. მანძ. (15 მ) / LDA",
    "Climb (Vy)": "აღმასვლა (Vy)", "Crosswind": "გვერდითი ქარი",
    "Total": "ჯამი", "local": "ადგილობრ.", "remove": "წაშლა", "copied!": "დაკოპირდა!",
    "Custom route": "საკუთარი მარშრუტი", "Local flight": "ადგილობრივი ფრენა",
    "Route 1 (via Kutaisi)": "მარშრუტი 1 (ქუთაისის გავლით)", "Route 2 (via Ambrolauri)": "მარშრუტი 2 (ამბროლაურის გავლით)",
    "Route 3 (direct, high terrain)": "მარშრუტი 3 (პირდაპირი, მაღალი რელიეფი)",
    "Route 2": "მარშრუტი 2", "Route 3": "მარშრუტი 3",
    "Aircraft identification": "საჰაერო ხომალდის იდენტიფიკაცია",
    "Flight rules / Type of flight": "ფრენის წესები / ფრენის ტიპი",
    "Number / Type / Wake turbulence category": "რაოდენობა / ტიპი / კვალის ტურბულენტობის კატეგორია",
    "Equipment (COM/NAV / Surveillance)": "აღჭურვილობა (COM/NAV / მეთვალყურეობა)",
    "Departure aerodrome / Time (EOBT)": "გაფრენის აეროდრომი / დრო (EOBT)",
    "Cruising speed / Level / Route": "საკრეისერო სიჩქარე / დონე / მარშრუტი",
    "Destination / Total EET / Alternate": "დანიშნულება / ჯამური EET / სათადარიგო",
    "Other information": "სხვა ინფორმაცია", "Emergency radio": "ავარიული რადიოშუქურა",
    "Survival equipment (jackets / dinghies)": "სამაშველო აღჭურვილობა (ჟილეტები / ნავები)",
    "Aircraft colour and markings": "საჰაერო ხომალდის ფერი და მარკირება",
    "Pilot-in-command": "მეთაური პილოტი (PIC)",
    "Reference POH, S/N 129/350 — not confirmed identical to S/N 379.": "საცნობარო POH, S/N 129/350 — S/N 379-თან იდენტურობა დადასტურებული არ არის.",
    "reference POH": "საცნობარო POH",
    "ULA and Light Aircraft Flight Computer — Safety Academia": "ULA და მსუბუქი საჰაერო ხომალდების ფრენის კალკულატორი — Safety Academia"
  };
  for (var k in EXTRA) D[k] = EXTRA[k];

  var SCEN = { "Economy": "ეკონომიური", "Normal": "ნორმალური", "Conservative real-world": "კონსერვატიული (რეალური)" };
  var R = [
    [/^(Depart|Arrive) · (.+)$/, function (m) { return (m[1] === "Depart" ? "აფრენა" : "დაფრენა") + " · " + m[2]; }],
    [/^Leg (\d+) wind (.+)$/, function (m) { return "მონაკვეთი " + m[1] + ", ქარი " + m[2]; }],
    [/^Wind (\d+°\/\d+)$/, function (m) { return "ქარი " + m[1]; }],
    [/^RWY (\d+) \(fixed departure\)$/, function (m) { return "RWY " + m[1] + " (ფიქსირებული, აფრენა)"; }],
    [/^RWY (\d+) \(fixed landing\)$/, function (m) { return "RWY " + m[1] + " (ფიქსირებული, დაფრენა)"; }],
    [/^RWY (\d+) \(best into wind\)$/, function (m) { return "RWY " + m[1] + " (საუკეთესო ქარის მიმართ)"; }],
    [/^(-?\d+) ft \(provisional\)$/, function (m) { return m[1] + " ft (წინასწარი)"; }],
    [/^([\d.]+)% (\([\d.]+°\) )?favorable — no distance credit taken$/, function (m) { return m[1] + "% " + (m[2] || "") + "სასარგებლო — მანძილის შემცირება არ ითვლება"; }],
    [/^([\d.]+)% adverse — \+(\d+)% distance$/, function (m) { return m[1] + "% არახელსაყრელი — მანძილი +" + m[2] + "%"; }],
    [/^Editing these numbers updates (.+?)'s profile immediately across Legs, Performance Check and Fuel Planning\.(?: (.+))?$/, function (m) {
      return "ამ რიცხვების შეცვლა " + m[1] + "-ის პროფილს მაშინვე განაახლებს მონაკვეთებში, მახასიათებლების შემოწმებასა და საწვავის დაგეგმვაში." + (m[2] ? " " + T(m[2]) : "");
    }],
    [/^(Economy|Normal|Conservative real-world) — ([\d.]+) km\/h, (~?)([\d.]+) L\/h( \(book\))?$/, function (m) {
      return SCEN[m[1]] + " — " + m[2] + " კმ/სთ, " + m[3] + m[4] + " ლ/სთ" + (m[5] ? " (სახელმძღვანელოთი)" : "");
    }],
    [/^Tank (\d+) — ([\d.]+) L usable$/, function (m) { return "ავზი " + m[1] + " — " + m[2] + " ლ გამოსაყენებელი"; }],
    [/^Tank (\d+)$/, function (m) { return "ავზი " + m[1]; }],
    [/^Empty weight ([\d.]+) kg, MTOW ([\d.]+) kg \((.+)\)$/, function (m) { return "ცარიელი მასა " + m[1] + " კგ, MTOW " + m[2] + " კგ (" + T(m[3]) + ")"; }],
    [/^([\d.]+) L \((\d+) min\)$/, function (m) { return m[1] + " ლ (" + m[2] + " წთ)"; }],
    [/^(.+) \(deficit\)$/, function (m) { return m[1] + " (დეფიციტი)"; }],
    [/^(\S+) \(local area\)$/, function (m) { return m[1] + " (ადგილობრივი ზონა)"; }],
    [/^Legs — (.+)$/, function (m) { return "მონაკვეთები — " + T(m[1]); }],
    [/^Local flight \((\S+)\)$/, function (m) { return "ადგილობრივი ფრენა (" + m[1] + ")"; }],
    [/^Uses (.+?)'s currently entered leg winds and OAT (-?\d+)°C \/ QNH (\d+) hPa \(set on that route's own tab\)\. (\d+) km total, (.+?) trip time at ([\d.]+) km\/h TAS, ([\d.]+) L\/h burn\.$/, function (m) {
      return "იყენებს „" + T(m[1]) + "“-ის მიმდინარე მონაკვეთების ქარებს და OAT " + m[2] + "°C / QNH " + m[3] + " ჰპა (მითითებულია ამ მარშრუტის ჩანართზე). სულ " + m[4] + " კმ, ფრენის დრო " + m[5] + ", TAS " + m[6] + " კმ/სთ, ხარჯი " + m[7] + " ლ/სთ.";
    }],
    [/^(.+) \(([A-Z0-9]{4,5})\)$/, function (m) { var t = T(m[1]); return t === m[1] ? null : t + " (" + m[2] + ")"; }]
  ];

  function T(s) {
    if (Object.prototype.hasOwnProperty.call(D, s)) return D[s];
    for (var i = 0; i < R.length; i++) {
      var m = s.match(R[i][0]);
      if (m) { var out = R[i][1](m); if (out != null) return out; }
    }
    if (s.indexOf(" · ") > 0) {
      var parts = s.split(" · "), changed = false;
      parts = parts.map(function (p) { var t = T(p); if (t !== p) changed = true; return t; });
      if (changed) return parts.join(" · ");
    }
    return s;
  }
  function tr(s) {
    var core = s.trim();
    if (!core || !/[A-Za-z]/.test(core)) return null;
    var out = T(core);
    if (out === core) return null;
    return s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];
  }
  function skipped(node) {
    for (var p = node.parentNode; p && p !== document.body; p = p.parentNode) {
      var n = p.nodeName;
      if (n === "SCRIPT" || n === "STYLE" || n === "TEXTAREA") return true;
      if (p.hasAttribute && p.hasAttribute("data-no-i18n")) return true;
      // ICAO flight plan values stay in English: they are filed with ATC as written.
      if (n === "TD" && p.cellIndex === 2 && p.parentNode && p.parentNode.parentNode && p.parentNode.parentNode.id === "fplBody") return true;
    }
    return false;
  }
  function doText(n) {
    if (skipped(n)) return;
    var t = tr(n.nodeValue);
    if (t !== null) n.nodeValue = t;
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(doText);
    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll("[placeholder]")));
    els.forEach(function (el) {
      var ph = el.getAttribute && el.getAttribute("placeholder");
      if (ph) { var t = tr(ph); if (t !== null) el.setAttribute("placeholder", t); }
    });
  }

  var title = tr(document.title);
  if (title) document.title = title;
  walk(document.body);
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === "characterData") doText(m.target);
      else m.addedNodes.forEach(walk);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
