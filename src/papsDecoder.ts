/**
 * PAPS (학생건강체력평가제) CP949 Character Decoder & Translation Table
 */

export const categoryMap: Record<string, string> = {
  "߷": "순발력",
  "ܰ˻": "근력근지구력",
  "ٷ±": "근력근지구력",
};

export const eventMap: Record<string, string> = {
  "պ޸": "왕복오래달리기",
  "޸ȱ": "하버드스텝검사",
  "ܰ˻": "스텝검사",
  "ɾα": "앉아윗몸앞으로굽히기",
  "ƿø": "윗몸말아올리기",
  "Ƿ": "악력",
  "50m޸": "50m달리기",
  "ڸָٱ": "제자리멀리뛰기",
  "ü": "체지방률",
};

export const schoolMap: Record<string, string> = {
  "б": "초등학교",
};

export const genderMap: Record<string, string> = {};

export const labelMap: Record<string, string> = {
  "浵": "경도비만",
  "ü": "과체중",
};


export interface PAPSRecord {
  id: string;
  rawCategory: string;
  rawEvent: string;
  rawGrade: string;
  rawGender: string;
  rawSchool: string;
  rawLabel: string;
  category: string;
  event: string;
  grade: string;
  gender: string;
  school: string;
  label: string;
  score: number;
  minVal: number;
  maxVal: number;
}

export function decodePAPSValue(val: string, type: "category" | "event" | "school" | "gender" | "label"): string {
  const trimmed = val.trim();
  if (!trimmed) return "";

  // Exact matches
  if (type === "category") {
    if (categoryMap[trimmed]) return categoryMap[trimmed];
    if (trimmed.includes("") && trimmed.includes("")) return "비만";
    if (trimmed.includes("")) return "유연성";
    if (trimmed.includes("߷")) return "순발력";
    if (trimmed.includes("ٷ±")) return "근력근지구력";
    if (trimmed.includes("") && trimmed.length >= 8) return "심폐지구력";
    return "체력평가";
  }

  if (type === "event") {
    if (eventMap[trimmed]) return eventMap[trimmed];
    if (trimmed.includes("պ")) return "왕복오래달리기";
    if (trimmed.includes("޸")) return "하버드스텝검사";
    if (trimmed.includes("ܰ")) return "스텝검사";
    if (trimmed.includes("ɾ")) return "앉아윗몸앞으로굽히기";
    if (trimmed.includes("")) return "체질량지수";
    if (trimmed.includes("")) return "윗몸말아올리기";
    if (trimmed.includes("Ƿ")) return "악력";
    if (trimmed.includes("50m")) return "50m달리기";
    if (trimmed.includes("ڸ")) return "제자리멀리뛰기";
    if (trimmed.includes("ü")) return "체지방률";
    return trimmed;
  }

  if (type === "school") {
    if (schoolMap[trimmed]) return schoolMap[trimmed];
    if (trimmed.includes("б")) return "중학교";
    if (trimmed.includes("б")) return "초등학교";
    return "초등학교";
  }

  if (type === "gender") {
    if (genderMap[trimmed]) return genderMap[trimmed];
    // Check characters
    if (trimmed.charCodeAt(0) === 45522 || trimmed.includes("")) return "여자";
    return "남자";
  }

  if (type === "label") {
    if (labelMap[trimmed]) return labelMap[trimmed];
    if (trimmed.includes("")) return "고도비만";
    if (trimmed.includes("浵")) return "경도비만";
    if (trimmed.includes("ü")) return "과체중";
    if (trimmed.includes("") && trimmed.length === 4) return "정상";
    if (trimmed.includes("") && trimmed.length === 5) return "저체중";
    return trimmed;
  }

  return trimmed;
}

export function parsePAPSLine(line: string, index: number): PAPSRecord | null {
  const parts = line.split(",");
  if (parts.length < 9) return null;

  const rawCategory = parts[0].trim();
  const rawEvent = parts[1].trim();
  const rawGrade = parts[2].trim();
  const rawGender = parts[3].trim();
  const rawSchool = parts[4].trim();
  const rawLabel = parts[5].trim();
  const rawScore = parts[6].trim();
  const rawMin = parts[7].trim();
  const rawMax = parts[8].trim();

  // Handle grade decoding (e.g., "3학년" -> "3학년")
  let grade = rawGrade;
  if (grade.includes("г")) {
    grade = grade.replace("г", "학년");
  }

  const category = decodePAPSValue(rawCategory, "category");
  const event = decodePAPSValue(rawEvent, "event");
  const school = decodePAPSValue(rawSchool, "school");
  const gender = decodePAPSValue(rawGender, "gender");
  
  // Label or Grade Point
  let label = rawLabel;
  if (category === "비만") {
    label = decodePAPSValue(rawLabel, "label");
  } else {
    // For normal physical assessment, label represents grade level 1 to 5
    label = rawLabel + "등급";
  }

  const score = parseInt(rawScore, 10) || 0;
  const minVal = parseFloat(rawMin) || 0;
  const maxVal = parseFloat(rawMax) || 0;

  return {
    id: `paps-${index}`,
    rawCategory,
    rawEvent,
    rawGrade,
    rawGender,
    rawSchool,
    rawLabel,
    category,
    event,
    grade,
    gender,
    school,
    label,
    score,
    minVal,
    maxVal,
  };
}
