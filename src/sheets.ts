import { PAPSRecord } from "./papsDecoder";

interface ExportOptions {
  title: string;
  records: PAPSRecord[];
  accessToken: string;
}

interface CreateSheetResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

/**
 * Creates a beautiful, pre-formatted Google Sheets spreadsheet filled with the specified PAPS records.
 */
export async function exportToGoogleSheets({
  title,
  records,
  accessToken,
}: ExportOptions): Promise<CreateSheetResponse> {
  // 1. Create a new Spreadsheet
  const createResponse = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: title || "PAPS 학생건강체력평가 등급 기준표",
      },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: "PAPS 기준표",
            gridProperties: {
              rowCount: Math.max(1000, records.length + 100),
              columnCount: 12,
            },
          },
        },
      ],
    }),
  });

  if (!createResponse.ok) {
    const errData = await createResponse.json();
    throw new Error(
      `Google Sheets creation failed: ${errData?.error?.message || createResponse.statusText}`
    );
  }

  const sheetData = (await createResponse.json()) as CreateSheetResponse;
  const { spreadsheetId, spreadsheetUrl } = sheetData;

  // 2. Format and populate the sheet using batchUpdate
  const headers = [
    "평가영역",
    "측정종목",
    "학년",
    "성별",
    "학교급",
    "평가등급/단계",
    "PAPS 점수",
    "최소기록",
    "최대기록",
  ];

  // Convert records to Sheets API RowData
  const headerRowCells = headers.map((h) => ({
    userEnteredValue: { stringValue: h },
    userEnteredFormat: {
      backgroundColor: { red: 22 / 255, green: 163 / 255, blue: 74 / 255 }, // #16a34a Forest Green
      textFormat: {
        bold: true,
        fontSize: 11,
        foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
      },
      horizontalAlignment: "CENTER",
      verticalAlignment: "MIDDLE",
      borders: {
        bottom: { style: "SOLID_MEDIUM", color: { red: 0.1, green: 0.1, blue: 0.1 } },
      },
    },
  }));

  const dataRows = records.map((record) => {
    return {
      values: [
        { userEnteredValue: { stringValue: record.category } },
        { userEnteredValue: { stringValue: record.event } },
        { userEnteredValue: { stringValue: record.grade } },
        { userEnteredValue: { stringValue: record.gender } },
        { userEnteredValue: { stringValue: record.school } },
        { userEnteredValue: { stringValue: record.label } },
        { userEnteredValue: { numberValue: record.score } },
        { userEnteredValue: { numberValue: record.minVal } },
        { userEnteredValue: { numberValue: record.maxVal } },
      ].map((cell, idx) => {
        // Aligned layout formats
        const isNumeric = idx >= 6;
        return {
          ...cell,
          userEnteredFormat: {
            textFormat: { fontSize: 10 },
            horizontalAlignment: isNumeric ? "RIGHT" : "CENTER",
            verticalAlignment: "MIDDLE",
            borders: {
              bottom: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.9 } },
            },
          },
        };
      }),
    };
  });

  const batchUpdateResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          // Update Cells (Headers + Data)
          {
            updateCells: {
              rows: [{ values: headerRowCells }, ...dataRows],
              fields: "userEnteredValue,userEnteredFormat",
              range: {
                sheetId: 0,
                startRowIndex: 0,
                startColumnIndex: 0,
              },
            },
          },
          // Format Row Heights
          {
            updateDimensionProperties: {
              range: {
                sheetId: 0,
                dimension: "ROWS",
                startIndex: 0,
                endIndex: 1,
              },
              properties: {
                pixelSize: 32,
              },
              fields: "pixelSize",
            },
          },
          // Freeze the header row
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
          // Auto-resize column widths to fit content
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 9,
              },
            },
          },
        ],
      }),
    },
  );

  if (!batchUpdateResponse.ok) {
    const errData = await batchUpdateResponse.json();
    throw new Error(
      `Google Sheets formatting failed: ${errData?.error?.message || batchUpdateResponse.statusText}`
    );
  }

  return { spreadsheetId, spreadsheetUrl };
}

export interface EvaluationRecord {
  studentName: string;
  school: string;
  grade: string;
  gender: string;
  event: string;
  category: string;
  measuredValue: number;
  score: number;
  gradeLabel: string;
  createdAt?: any;
}

interface ExportEvaluationsOptions {
  title: string;
  evaluations: EvaluationRecord[];
  accessToken: string;
}

export async function exportEvaluationsToGoogleSheets({
  title,
  evaluations,
  accessToken,
}: ExportEvaluationsOptions): Promise<CreateSheetResponse> {
  // 1. Create a new Spreadsheet
  const createResponse = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: title || "PAPS 학생 건강체력평가 학급기록부",
      },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: "학급 평가 기록",
            gridProperties: {
              rowCount: Math.max(1000, evaluations.length + 100),
              columnCount: 10,
            },
          },
        },
      ],
    }),
  });

  if (!createResponse.ok) {
    const errData = await createResponse.json();
    throw new Error(
      `Google Sheets creation failed: ${errData?.error?.message || createResponse.statusText}`
    );
  }

  const sheetData = (await createResponse.json()) as CreateSheetResponse;
  const { spreadsheetId, spreadsheetUrl } = sheetData;

  // Headers
  const headers = [
    "학생 이름",
    "학교급",
    "학년",
    "성별",
    "평가영역",
    "측정종목",
    "측정값",
    "획득 점수",
    "평가등급/단계",
    "기록 시간"
  ];

  const headerRowCells = headers.map((h) => ({
    userEnteredValue: { stringValue: h },
    userEnteredFormat: {
      backgroundColor: { red: 37 / 255, green: 99 / 255, blue: 235 / 255 }, // #2563eb Royal Blue for history
      textFormat: {
        bold: true,
        fontSize: 11,
        foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
      },
      horizontalAlignment: "CENTER",
      verticalAlignment: "MIDDLE",
      borders: {
        bottom: { style: "SOLID_MEDIUM", color: { red: 0.1, green: 0.1, blue: 0.1 } },
      },
    },
  }));

  const dataRows = evaluations.map((record) => {
    let dateStr = "";
    if (record.createdAt) {
      if (record.createdAt.seconds) {
        dateStr = new Date(record.createdAt.seconds * 1000).toLocaleString("ko-KR");
      } else if (record.createdAt.toDate) {
        dateStr = record.createdAt.toDate().toLocaleString("ko-KR");
      } else {
        dateStr = new Date(record.createdAt).toLocaleString("ko-KR");
      }
    }
    return {
      values: [
        { userEnteredValue: { stringValue: record.studentName } },
        { userEnteredValue: { stringValue: record.school } },
        { userEnteredValue: { stringValue: record.grade } },
        { userEnteredValue: { stringValue: record.gender } },
        { userEnteredValue: { stringValue: record.category } },
        { userEnteredValue: { stringValue: record.event } },
        { userEnteredValue: { numberValue: record.measuredValue } },
        { userEnteredValue: { numberValue: record.score } },
        { userEnteredValue: { stringValue: record.gradeLabel } },
        { userEnteredValue: { stringValue: dateStr } },
      ].map((cell, idx) => {
        const isNumeric = idx === 6 || idx === 7;
        return {
          ...cell,
          userEnteredFormat: {
            textFormat: { fontSize: 10 },
            horizontalAlignment: isNumeric ? "RIGHT" : "CENTER",
            verticalAlignment: "MIDDLE",
            borders: {
              bottom: { style: "SOLID", color: { red: 0.9, green: 0.9, blue: 0.9 } },
            },
          },
        };
      }),
    };
  });

  const batchUpdateResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            updateCells: {
              rows: [{ values: headerRowCells }, ...dataRows],
              fields: "userEnteredValue,userEnteredFormat",
              range: {
                sheetId: 0,
                startRowIndex: 0,
                startColumnIndex: 0,
              },
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: 0,
                dimension: "ROWS",
                startIndex: 0,
                endIndex: 1,
              },
              properties: {
                pixelSize: 32,
              },
              fields: "pixelSize",
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 10,
              },
            },
          },
        ],
      }),
    },
  );

  if (!batchUpdateResponse.ok) {
    const errData = await batchUpdateResponse.json();
    throw new Error(
      `Google Sheets formatting failed: ${errData?.error?.message || batchUpdateResponse.statusText}`
    );
  }

  return { spreadsheetId, spreadsheetUrl };
}
