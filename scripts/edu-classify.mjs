// Shared by build-snapshot.mjs and patch-education.mjs.
// OSM amenity=school is often used for universities/colleges/nurseries, so the name is used to correct the type
// and to derive an education level (cat) for map symbology.
const TERTIARY_COLLEGE = /polytechnic|monotechnic|federal college of|college of (education|health|agricultur|technolog|nursing|medic|science)|school of (nursing|health|midwifery|post|basic)|institute of|\bcoe\b/i;
const NOT_INSTITUTION = /\b(staff|primary|secondary|nursery|high|grammar|comprehensive|model|junior|senior|international school|preparatory)\b/i;
const NURSERY = /nursery|kindergarten|creche|cr[eè]che|montessori|day ?care|pre-?school/i;
const PRIMARY = /primary|\bpri\b\.?|\bpry\b|elementary|basic school|nomadic/i;
const SECONDARY = /secondary|high school|grammar|comprehensive|model college|junior|senior|\bjss\b|\bsss\b|\bcollege\b|\bsec\.? ?sch/i;

// Individual buildings inside a campus (mapped as building=school/university) are not separate institutions.
const CAMPUS = /\b(faculty|department|dept|lab|laboratory|library|senate|hostel|lecture|theatre|theater|bursary|busary|postgraduate|auditorium|hall|ict|clinic|block|complex|admin|secretariat|registry)\b|\bbuilding\b|^[A-Z]{2,4}$/i;
const INSTITUTION_WORD = /(school|college|university|academy|nursery|polytechnic|institute|kindergarten|schools)/i;

export function classifyEducation(name, rawKind) {
  const n = name || "";
  if (n && CAMPUS.test(n) && !/\b(school|nursery|academy|kindergarten|polytechnic)\b/i.test(n)) return { kind: "campus", cat: "Campus building" };
  if (n && /^(ict|[a-z]{2,4})\b.*\b(lab|block)\b/i.test(n)) return { kind: "campus", cat: "Campus building" };
  let kind = rawKind || "school";
  if (/\buniversity\b/i.test(n) && !/staff school|primary|secondary|nursery|high school|demonstration/i.test(n)) kind = "university";
  else if (TERTIARY_COLLEGE.test(n) && !/primary|secondary|nursery|high school/i.test(n)) kind = "college";
  else if (NURSERY.test(n) && !/primary|secondary|high/i.test(n)) kind = "kindergarten";
  else if (kind === "university" || kind === "college") kind = "school"; // building-only tag but a school by name
  let cat;
  if (kind === "university" || kind === "college") cat = "Tertiary";
  else if (kind === "kindergarten") cat = "Nursery";
  else if (PRIMARY.test(n) && !SECONDARY.test(n.replace(/primary/gi, ""))) cat = "Primary";
  else if (SECONDARY.test(n)) cat = "Secondary";
  else if (PRIMARY.test(n)) cat = "Primary";
  else cat = "School";
  return { kind, cat };
}
