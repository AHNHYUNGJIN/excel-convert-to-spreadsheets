import React, { useState, useEffect } from "react";
import {
  Upload,
  Database,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  Search,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Grid,
  Trash2,
  PlusCircle,
  UserCheck,
} from "lucide-react";
import { User } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { preloadedRecords, rawPAPSCSV } from "./papsData";
import { PAPSRecord, parsePAPSLine } from "./papsDecoder";
import { googleSignIn, logout, initAuth, db, handleFirestoreError, OperationType } from "./firebase";
import { exportToGoogleSheets, exportEvaluationsToGoogleSheets, EvaluationRecord } from "./sheets";

export default function App() {
  // PAPS Records State
  const [records, setRecords] = useState<PAPSRecord[]>(preloadedRecords);
  const [fileName, setFileName] = useState("PAPS 학생건강체력평가 기준표");
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Filters State
  const [selectedSchool, setSelectedSchool] = useState<string>("전체");
  const [selectedGrade, setSelectedGrade] = useState<string>("전체");
  const [selectedGender, setSelectedGender] = useState<string>("전체");
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [searchQuery, setSearchQuery] = useState("");

  // Tabs state: "table", "calculator", or "history"
  const [activeTab, setActiveTab] = useState<"table" | "calculator" | "history">("table");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Export State
  const [exportScope, setExportScope] = useState<"all" | "filtered">("filtered");
  const [exporting, setExporting] = useState(false);
  const [exportedSheetUrl, setExportedSheetUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calculator State
  const [calcSchool, setCalcSchool] = useState<string>("초등학교");
  const [calcGrade, setCalcGrade] = useState<string>("5학년");
  const [calcGender, setCalcGender] = useState<string>("남자");
  const [calcEvent, setCalcEvent] = useState<string>("왕복오래달리기");
  const [calcValue, setCalcValue] = useState<string>("");
  const [calcResult, setCalcResult] = useState<{
    score: number;
    gradeLabel: string;
    pointsMsg: string;
  } | null>(null);

  // Firestore Saved Evaluations State
  const [savedEvaluations, setSavedEvaluations] = useState<any[]>([]);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);
  const [studentNameInput, setStudentNameInput] = useState("");
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // File drag & drop state
  const [isDragging, setIsDragging] = useState(false);

  // Initialize Auth on Load
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setLoadingAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setLoadingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Synchronize Firestore studentEvaluations
  useEffect(() => {
    if (!db || !user) {
      setSavedEvaluations([]);
      return;
    }
    setLoadingEvaluations(true);
    const q = query(collection(db, "studentEvaluations"), where("ownerId", "==", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        // Sort by createdAt descending
        list.sort((a, b) => {
          const timeA = a.createdAt?.seconds ? a.createdAt.seconds : (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0);
          const timeB = b.createdAt?.seconds ? b.createdAt.seconds : (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0);
          return timeB - timeA;
        });
        setSavedEvaluations(list);
        setLoadingEvaluations(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "studentEvaluations");
        setLoadingEvaluations(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setErrorMsg(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
      }
    } catch (error: any) {
      console.error("Login Error:", error);
      setErrorMsg("Google 로그인에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setExportedSheetUrl(null);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // Extract list of unique categories and events for filters
  const schoolsList = ["전체", "초등학교", "중학교"];
  const categoriesList = ["전체", ...Array.from(new Set(records.map((r) => r.category)))];
  
  // Filters records dynamically
  const filteredRecords = records.filter((record) => {
    const matchSchool = selectedSchool === "전체" || record.school === selectedSchool;
    const matchGrade = selectedGrade === "전체" || record.grade === selectedGrade;
    const matchGender = selectedGender === "전체" || record.gender === selectedGender;
    const matchCategory = selectedCategory === "전체" || record.category === selectedCategory;
    const matchSearch =
      !searchQuery ||
      record.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.category.toLowerCase().includes(searchQuery.toLowerCase());

    return matchSchool && matchGrade && matchGender && matchCategory && matchSearch;
  });

  // Unique events based on calculator filters
  const availableCalcEvents = Array.from(
    new Set(
      records
        .filter((r) => r.school === calcSchool && r.grade === calcGrade && r.gender === calcGender)
        .map((r) => r.event)
    )
  );

  // Set default calc event when dependencies change
  useEffect(() => {
    if (availableCalcEvents.length > 0) {
      if (!availableCalcEvents.includes(calcEvent)) {
        setCalcEvent(availableCalcEvents[0]);
      }
    }
  }, [calcSchool, calcGrade, calcGender, availableCalcEvents, calcEvent]);

  // Handle pagination reset when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSchool, selectedGrade, selectedGender, selectedCategory, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // File Upload Handling
  const handleCSVUpload = (text: string, name: string) => {
    const lines = text.split("\n");
    const parsed: PAPSRecord[] = [];
    lines.forEach((line, idx) => {
      const record = parsePAPSLine(line, idx);
      if (record) {
        parsed.push(record);
      }
    });

    if (parsed.length > 0) {
      setRecords(parsed);
      const cleanName = name.replace(/\.[^/.]+$/, "");
      setFileName(cleanName + " - Sheets");
      setErrorMsg(null);
    } else {
      setErrorMsg("유효한 PAPS CSV 데이터를 찾을 수 없습니다. 파일 인코딩 형식을 확인해 주세요.");
    }
  };

  const handleFileUploadEvent = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        handleCSVUpload(event.target.result as string, file.name);
      }
    };
    reader.readAsText(file, "EUC-KR"); // Support EUC-KR upload
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleCSVUpload(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file, "EUC-KR");
    }
  };

  // Reset to Default CSV
  const resetToDefault = () => {
    const parsed: PAPSRecord[] = [];
    rawPAPSCSV.split("\n").forEach((line, idx) => {
      const record = parsePAPSLine(line, idx);
      if (record) {
        parsed.push(record);
      }
    });
    setRecords(parsed);
    setFileName("PAPS 학생건강체력평가 기준표");
    setErrorMsg(null);
  };

  // Export to Google Sheets Flow
  const handleExport = async () => {
    if (!token) {
      setErrorMsg("Google 계정으로 먼저 로그인해 주세요.");
      return;
    }

    const recordsToExport = exportScope === "all" ? records : filteredRecords;

    if (recordsToExport.length === 0) {
      setErrorMsg("내보낼 데이터가 없습니다. 필터를 조정해 주세요.");
      return;
    }

    setExporting(true);
    setExportedSheetUrl(null);
    setErrorMsg(null);

    try {
      const res = await exportToGoogleSheets({
        title: fileName,
        records: recordsToExport,
        accessToken: token,
      });
      setExportedSheetUrl(res.spreadsheetUrl);
    } catch (error: any) {
      console.error("Google Sheets Export Error:", error);
      setErrorMsg(error.message || "구글 스프레드시트 내보내기 중 에러가 발생했습니다.");
    } finally {
      setExporting(false);
    }
  };

  // Perform Score Calculation
  const handleCalculate = () => {
    const val = parseFloat(calcValue);
    if (isNaN(val)) {
      setCalcResult(null);
      return;
    }

    // Filter rules matching school level, grade, gender, event
    const matchedRules = records.filter(
      (r) =>
        r.school === calcSchool &&
        r.grade === calcGrade &&
        r.gender === calcGender &&
        r.event === calcEvent
    );

    if (matchedRules.length === 0) {
      setErrorMsg("해당 조건에 해당하는 PAPS 기준 데이터를 찾을 수 없습니다.");
      setCalcResult(null);
      return;
    }

    // For BMI (체질량지수) and 하버드스텝검사, lower might be better or ranges are specific
    // Find the matching range
    let bestMatch: PAPSRecord | null = null;

    if (calcEvent === "체질량지수") {
      // Find range: minVal <= val <= maxVal
      bestMatch = matchedRules.find((r) => val >= r.minVal && val <= r.maxVal) || null;
    } else if (calcEvent === "50m달리기" || calcEvent === "하버드스텝검사") {
      // Lower is better (time/heart-rate sum)
      // Find range: minVal <= val <= maxVal
      bestMatch = matchedRules.find((r) => val >= r.minVal && val <= r.maxVal) || null;
    } else {
      // Higher is better (count, cm, laps)
      // Find range: minVal <= val <= maxVal
      bestMatch = matchedRules.find((r) => val >= r.minVal && val <= r.maxVal) || null;
    }

    if (bestMatch) {
      setCalcResult({
        score: bestMatch.score,
        gradeLabel: bestMatch.label,
        pointsMsg: `${bestMatch.category} - ${bestMatch.event} 평가에서 ${bestMatch.score}점을 획득하였습니다.`,
      });
      setErrorMsg(null);
    } else {
      // No range found, let's suggest boundary score
      // Check if it exceeds max of top row or min of bottom row
      const sorted = [...matchedRules].sort((a, b) => b.score - a.score); // Descending score
      const topRule = sorted[0];
      const bottomRule = sorted[sorted.length - 1];

      if (calcEvent === "50m달리기" || calcEvent === "하버드스텝검사") {
        if (val < topRule.minVal) {
          bestMatch = topRule;
        } else if (val > bottomRule.maxVal) {
          bestMatch = bottomRule;
        }
      } else {
        if (val > topRule.maxVal) {
          bestMatch = topRule;
        } else if (val < bottomRule.minVal) {
          bestMatch = bottomRule;
        }
      }

      if (bestMatch) {
        setCalcResult({
          score: bestMatch.score,
          gradeLabel: bestMatch.label,
          pointsMsg: `${bestMatch.category} - ${bestMatch.event} 평가에서 ${bestMatch.score}점을 획득하였습니다.`,
        });
        setErrorMsg(null);
      } else {
        setErrorMsg("측정값이 기준 범위를 초과했습니다. 유효한 범위의 값을 입력해 주세요.");
        setCalcResult(null);
      }
    }
  };

  // Save Evaluation Record to Firestore
  const handleSaveEvaluation = async () => {
    if (!db) {
      setErrorMsg("데이터베이스가 초기화되지 않았습니다.");
      return;
    }
    if (!user) {
      setErrorMsg("구글 로그인 후 이용할 수 있는 기능입니다.");
      return;
    }
    if (!calcResult) {
      setErrorMsg("먼저 측정 기록의 점수를 산출해 주세요.");
      return;
    }
    if (!studentNameInput.trim()) {
      setErrorMsg("저장할 학생 이름을 입력해 주세요.");
      return;
    }

    setSavingEvaluation(true);
    setErrorMsg(null);

    try {
      const docId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const eventCategory = records.find((r) => r.event === calcEvent)?.category || "체력평가";
      const data = {
        studentName: studentNameInput.trim(),
        school: calcSchool,
        grade: calcGrade,
        gender: calcGender,
        event: calcEvent,
        category: eventCategory,
        measuredValue: parseFloat(calcValue),
        score: calcResult.score,
        gradeLabel: calcResult.gradeLabel,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "studentEvaluations", docId), data);
      setStudentNameInput("");
      setCalcValue("");
      setCalcResult(null);
      setActiveTab("history");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, "studentEvaluations");
    } finally {
      setSavingEvaluation(false);
    }
  };

  // Delete Evaluation Record from Firestore
  const handleDeleteEvaluation = async (id: string) => {
    if (!db || !user) return;
    if (!window.confirm("이 평가 기록을 정말 삭제하시겠습니까?")) return;
    setErrorMsg(null);
    try {
      await deleteDoc(doc(db, "studentEvaluations", id));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `studentEvaluations/${id}`);
    }
  };

  // Export Saved Evaluations in Firestore to Google Sheets
  const handleExportEvaluations = async () => {
    if (!token) {
      setErrorMsg("Google 계정으로 먼저 로그인해 주세요.");
      return;
    }
    if (savedEvaluations.length === 0) {
      setErrorMsg("내보낼 저장된 학생 평가 기록이 없습니다.");
      return;
    }

    setExporting(true);
    setExportedSheetUrl(null);
    setErrorMsg(null);

    try {
      // Filter evaluations by search query if needed
      const filtered = savedEvaluations.filter((record) => {
        return (
          !historySearchQuery ||
          record.studentName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
          record.event.toLowerCase().includes(historySearchQuery.toLowerCase())
        );
      });

      if (filtered.length === 0) {
        setErrorMsg("검색 필터에 일치하는 내보낼 평가 기록이 없습니다.");
        setExporting(false);
        return;
      }

      const res = await exportEvaluationsToGoogleSheets({
        title: `${user?.displayName || "선생님"} - PAPS 학급 체력평가 기록부`,
        evaluations: filtered,
        accessToken: token,
      });
      setExportedSheetUrl(res.spreadsheetUrl);
    } catch (error: any) {
      console.error("Google Sheets Export Error:", error);
      setErrorMsg(error.message || "학급기록부 구글 스프레드시트 내보내기 중 에러가 발생했습니다.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="paps-app-root" className="flex flex-col h-screen w-full bg-[#f8fafc] text-[#1e293b] font-sans overflow-hidden">
      
      {/* HEADER */}
      <header id="paps-header" className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-600 rounded-lg flex items-center justify-center shadow-xs">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-md font-bold text-slate-800 tracking-tight flex items-center gap-2">
              PAPS 기준표 &amp; 스프레드시트 내보내기 프로
              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">v2.1</span>
            </h1>
            <p className="text-xs text-slate-500">학생건강체력평가 등급별 기준 조회 및 구글 스프레드시트 즉시 생성</p>
          </div>
        </div>

        {/* AUTH CONTROLS */}
        <div className="flex items-center gap-4">
          {loadingAuth ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>로그인 상태 확인 중...</span>
            </div>
          ) : user ? (
            <div className="flex items-center gap-4 bg-slate-50 p-1.5 pr-3 rounded-full border border-slate-200">
              <div className="w-8 h-8 rounded-full bg-green-600 border border-green-700 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "AD"}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-700 leading-none">{user.displayName || "선생님/관리자"}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">{user.email}</p>
              </div>
              <button
                id="btn-logout"
                onClick={handleLogout}
                className="p-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-100 transition-colors"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              id="btn-google-login"
              onClick={handleLogin}
              className="flex items-center gap-2.5 px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 rounded-lg text-slate-700 text-sm font-medium transition-all shadow-xs cursor-pointer hover:bg-slate-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>Google 계정으로 로그인</span>
            </button>
          )}
        </div>
      </header>

      {/* BODY WORKSPACE */}
      <div id="paps-workspace" className="flex flex-1 overflow-hidden">
        
        {/* LEFT SIDEBAR */}
        <aside id="paps-sidebar" className="w-80 bg-white border-r border-slate-200 flex flex-col p-6 shrink-0 overflow-y-auto gap-6">
          
          {/* Active Database State */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> 데이터 세션
            </h2>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800 truncate">paps_standards_db.csv</p>
              <p className="text-xs text-slate-500 mt-1">{records.length.toLocaleString()}행의 평가 기준 탑재 완료</p>
              <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-green-500 h-full w-full"></div>
              </div>
              <button
                onClick={resetToDefault}
                className="mt-3 text-[11px] font-medium text-green-600 hover:text-green-700 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> 기본 탑재 기준표로 초기화
              </button>
            </div>
          </div>

          {/* CSV File Drag & Drop Upload Zone */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" /> 신규 CSV 업로드 (EUC-KR)
            </h2>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-green-500 bg-green-50/50"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
              }`}
            >
              <input
                type="file"
                accept=".csv"
                id="csv-file-input"
                onChange={handleFileUploadEvent}
                className="hidden"
              />
              <label htmlFor="csv-file-input" className="cursor-pointer">
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center mx-auto mb-2 border border-slate-200 shadow-xs">
                  <Upload className="w-4 h-4 text-slate-500" />
                </div>
                <p className="text-xs font-medium text-slate-700">기본 파일 드래그 또는 선택</p>
                <p className="text-[10px] text-slate-400 mt-1">PAPS 기준표 양식 CSV 파일 지원</p>
              </label>
            </div>
          </div>

          {/* Sheets Export Settings */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                생성 파일명
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                placeholder="Google Sheet 파일 이름"
              />
            </div>

            {activeTab !== "history" ? (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  내보내기 범위
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportScope("all")}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      exportScope === "all"
                        ? "bg-green-50 border-green-200 text-green-700 shadow-2xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    모든 데이터 ({records.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportScope("filtered")}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      exportScope === "filtered"
                        ? "bg-green-50 border-green-200 text-green-700 shadow-2xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    필터된 데이터 ({filteredRecords.length})
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100 text-xs text-blue-800 leading-relaxed">
                <span className="font-bold block mb-1">📝 학급 평가 기록부 모드</span>
                저장된 {savedEvaluations.length}명의 학생 평가 기록이 학급기록부 양식으로 생성됩니다.
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                저장소 위치
              </label>
              <div className="flex items-center gap-2.5 p-2.5 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 text-slate-600">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <span className="truncate">구글 드라이브 최상위 폴더</span>
              </div>
            </div>
          </div>

          {/* Export Action Button */}
          <div className="mt-auto pt-4 border-t border-slate-100">
            {user ? (
              <button
                id="btn-export-sheets"
                onClick={activeTab === "history" ? handleExportEvaluations : handleExport}
                disabled={exporting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {exporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>스프레드시트 생성 중...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{activeTab === "history" ? "학급기록부 구글시트 생성" : "구글 스프레드시트 생성"}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>로그인하고 내보내기</span>
              </button>
            )}
            <p className="text-[10px] text-center text-slate-400 mt-2.5 italic">스프레드시트 원본 보존 및 가공 가능</p>
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main id="paps-main" className="flex-1 bg-[#f1f5f9] p-8 flex flex-col gap-6 overflow-hidden">
          
          {/* Notification Banners */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-center gap-3 shadow-xs shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {exportedSheetUrl && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-5 py-4 rounded-xl flex items-center justify-between gap-4 shadow-sm shrink-0">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5.5 h-5.5 text-green-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">스프레드시트 생성 완료!</h3>
                  <p className="text-xs text-green-700 mt-0.5">선택한 PAPS 등급 기준표 데이터가 구글 시트로 안전하게 내보내졌습니다.</p>
                </div>
              </div>
              <a
                href={exportedSheetUrl}
                target="_blank"
                referrerPolicy="no-referrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow-md transition-all shrink-0 cursor-pointer"
              >
                <span>스프레드시트 열기</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Overview Top Stats */}
          <section id="paps-stats" className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">전체 기준 행수</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">{records.length.toLocaleString()} <span className="text-xs font-normal text-slate-400">행</span></p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Grid className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">조회 필터 범위</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">{filteredRecords.length.toLocaleString()} <span className="text-xs font-normal text-slate-400">행</span></p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">PAPS 평가종목</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">8 <span className="text-xs font-normal text-slate-400">개 항목</span></p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">수출 문서 형식</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">Google Sheets</p>
              </div>
            </div>
          </section>

          {/* Toggle Tabs Between Data Table & PAPS Calculator */}
          <div className="flex justify-between items-center shrink-0">
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("table")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "table"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                기준표 데이터 조회
              </button>
              <button
                onClick={() => setActiveTab("calculator")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "calculator"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                인터랙티브 PAPS 점수 계산기
              </button>
              {user && (
                <button
                  onClick={() => setActiveTab("history")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "history"
                      ? "bg-white text-slate-800 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Database className="w-3.5 h-3.5 text-green-600" />
                  학급 평가 기록부 (Firestore)
                </button>
              )}
            </div>

            {/* General actions */}
            {activeTab === "table" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedSchool("전체");
                    setSelectedGrade("전체");
                    setSelectedGender("전체");
                    setSelectedCategory("전체");
                    setSearchQuery("");
                  }}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  필터 초기화
                </button>
              </div>
            )}
            {activeTab === "history" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setHistorySearchQuery("");
                  }}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  검색 초기화
                </button>
              </div>
            )}
          </div>

          {/* MAIN DYNAMIC CONTENT */}
          {activeTab === "table" ? (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              
              {/* FILTERS BOX */}
              <div id="paps-filters" className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs shrink-0 grid grid-cols-1 md:grid-cols-5 gap-4">
                
                {/* Search Term */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    종목/영역 키워드 검색
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="예: 오래달리기, 유연성"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* School Level Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    학교급
                  </label>
                  <select
                    value={selectedSchool}
                    onChange={(e) => setSelectedSchool(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-green-500 focus:outline-hidden font-medium"
                  >
                    {schoolsList.map((sc) => (
                      <option key={sc} value={sc}>
                        {sc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grade Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    학년
                  </label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-green-500 focus:outline-hidden font-medium"
                  >
                    <option value="전체">전체 학년</option>
                    <option value="1학년">1학년</option>
                    <option value="2학년">2학년</option>
                    <option value="3학년">3학년</option>
                    <option value="4학년">4학년</option>
                    <option value="5학년">5학년</option>
                    <option value="6학년">6학년</option>
                  </select>
                </div>

                {/* Gender Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    성별
                  </label>
                  <select
                    value={selectedGender}
                    onChange={(e) => setSelectedGender(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-green-500 focus:outline-hidden font-medium"
                  >
                    <option value="전체">남/여 전체</option>
                    <option value="남자">남자</option>
                    <option value="여자">여자</option>
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    평가영역
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-green-500 focus:outline-hidden font-medium"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* DATA TABLE CONTAINER CARD */}
              <div id="paps-table-card" className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[15%] text-center">평가영역</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[20%]">측정종목</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[10%] text-center">학년</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[10%] text-center">성별</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[10%] text-center">학교급</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[15%] text-center">등급/단계</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[10%] text-right">PAPS 점수</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[15%] text-right">최소 기록</th>
                        <th className="px-5 py-3.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[15%] text-right">최대 기록</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-slate-600 divide-y divide-slate-100">
                      {paginatedRecords.length > 0 ? (
                        paginatedRecords.map((record) => {
                          // Dynamic obesity and grade styling badges
                          let labelStyle = "bg-slate-100 text-slate-700";
                          if (record.category === "비만") {
                            if (record.label === "고도비만") labelStyle = "bg-red-100 text-red-700 font-bold";
                            else if (record.label === "경도비만") labelStyle = "bg-orange-100 text-orange-700";
                            else if (record.label === "과체중") labelStyle = "bg-amber-100 text-amber-700";
                            else if (record.label === "정상") labelStyle = "bg-green-100 text-green-700 font-medium";
                            else if (record.label === "저체중") labelStyle = "bg-blue-100 text-blue-700";
                          } else {
                            if (record.label === "1등급") labelStyle = "bg-green-100 text-green-700 font-bold";
                            else if (record.label === "2등급") labelStyle = "bg-teal-100 text-teal-700 font-medium";
                            else if (record.label === "3등급") labelStyle = "bg-indigo-100 text-indigo-700";
                            else if (record.label === "4등급") labelStyle = "bg-amber-100 text-amber-700";
                            else if (record.label === "5등급") labelStyle = "bg-red-100 text-red-700";
                          }

                          return (
                            <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3 text-center font-semibold text-slate-700">{record.category}</td>
                              <td className="px-5 py-3 font-medium text-slate-800">{record.event}</td>
                              <td className="px-5 py-3 text-center">{record.grade}</td>
                              <td className="px-5 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  record.gender === "남자" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                                }`}>
                                  {record.gender}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-center text-slate-500">{record.school}</td>
                              <td className="px-5 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${labelStyle}`}>
                                  {record.label}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-semibold text-slate-900 font-mono">{record.score}점</td>
                              <td className="px-5 py-3 text-right font-mono text-slate-500">{record.minVal.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right font-mono text-slate-500">{record.maxVal.toLocaleString()}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm font-medium">검색 조건에 맞는 PAPS 기준 데이터가 없습니다.</p>
                            <p className="text-xs text-slate-400 mt-1">필터를 다시 조정하거나 기본 데이터로 초기화해 주세요.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* TABLE FOOTER & PAGINATION */}
                <div className="shrink-0 border-t border-slate-200 p-4 bg-slate-50 flex flex-col sm:flex-row items-center justify-between text-xs font-semibold text-slate-500 gap-3">
                  <div className="flex items-center gap-4">
                    <span>
                      총 {filteredRecords.length.toLocaleString()}행 중 {((currentPage - 1) * itemsPerPage + 1).toLocaleString()}-
                      {Math.min(currentPage * itemsPerPage, filteredRecords.length).toLocaleString()}행 조회 중
                    </span>
                    <span className="flex items-center gap-1.5 font-medium text-slate-400">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      내보내기 연동 준비 완료
                    </span>
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      
                      <div className="flex items-center gap-1 px-1">
                        <span className="text-slate-800 font-bold">{currentPage}</span>
                        <span className="text-slate-300">/</span>
                        <span>{totalPages}</span>
                      </div>

                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "history" ? (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* SAVED HISTORY STATISTICS BAR */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 shrink-0">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">학급 저장 기록 수</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{savedEvaluations.length} <span className="text-xs font-normal text-slate-400">건</span></p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">평가 완료 학생 수</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">
                      {new Set(savedEvaluations.map((e) => e.studentName)).size} <span className="text-xs font-normal text-slate-400">명</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">학급 평균 점수</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">
                      {savedEvaluations.length > 0
                        ? (savedEvaluations.reduce((sum, e) => sum + e.score, 0) / savedEvaluations.length).toFixed(1)
                        : "0.0"}{" "}
                      <span className="text-xs font-normal text-slate-400">점</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">1-2등급 획득률</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">
                      {savedEvaluations.length > 0
                        ? (
                            (savedEvaluations.filter(
                              (e) => e.gradeLabel.includes("1등급") || e.gradeLabel.includes("2등급") || e.gradeLabel === "정상"
                            ).length /
                              savedEvaluations.length) *
                            100
                          ).toFixed(0)
                        : "0"}{" "}
                      <span className="text-xs font-normal text-slate-400">%</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* FILTER / SEARCH BOX */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:w-80">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    학생 이름 / 측정 종목 검색
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="이름 또는 종목 입력..."
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium self-end sm:self-center">
                  * 각 행의 <span className="font-bold text-red-500">삭제</span> 버튼을 눌러 개별 기록을 삭제할 수 있습니다.
                </div>
              </div>

              {/* TABLE CONTAINER */}
              <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-400 font-bold border-b border-slate-200 uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-5 py-3 text-center w-12">#</th>
                        <th className="px-5 py-3">학생 이름</th>
                        <th className="px-5 py-3 text-center">학교급</th>
                        <th className="px-5 py-3 text-center">학년</th>
                        <th className="px-5 py-3 text-center">성별</th>
                        <th className="px-5 py-3">평가영역 / 종목</th>
                        <th className="px-5 py-3 text-right">측정 기록</th>
                        <th className="px-5 py-3 text-right">점수 (20점 만점)</th>
                        <th className="px-5 py-3 text-center">평가 등급</th>
                        <th className="px-5 py-3 text-center">등록 시간</th>
                        <th className="px-5 py-3 text-center w-16">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingEvaluations ? (
                        <tr>
                          <td colSpan={11} className="px-5 py-12 text-center text-slate-400">
                            <RefreshCw className="w-8 h-8 mx-auto mb-2 text-green-600 animate-spin" />
                            <p className="text-sm font-medium">실시간 데이터 동기화 중...</p>
                          </td>
                        </tr>
                      ) : savedEvaluations.filter((record) => {
                          return (
                            !historySearchQuery ||
                            record.studentName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
                            record.event.toLowerCase().includes(historySearchQuery.toLowerCase())
                          );
                        }).length > 0 ? (
                        savedEvaluations
                          .filter((record) => {
                            return (
                              !historySearchQuery ||
                              record.studentName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
                              record.event.toLowerCase().includes(historySearchQuery.toLowerCase())
                            );
                          })
                          .map((record, index) => {
                            let dateStr = "";
                            if (record.createdAt) {
                              if (record.createdAt.seconds) {
                                dateStr = new Date(record.createdAt.seconds * 1000).toLocaleString("ko-KR", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              } else if (record.createdAt.toDate) {
                                dateStr = record.createdAt.toDate().toLocaleString("ko-KR", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              } else {
                                dateStr = new Date(record.createdAt).toLocaleString("ko-KR", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              }
                            }

                            const isTopGrade = record.gradeLabel.includes("1등급") || record.gradeLabel === "정상";
                            const isBottomGrade = record.gradeLabel.includes("5등급") || record.gradeLabel.includes("비만");
                            
                            let labelStyle = "bg-indigo-50 text-indigo-700 border border-indigo-100";
                            if (isTopGrade) {
                              labelStyle = "bg-green-50 text-green-700 border border-green-100";
                            } else if (isBottomGrade) {
                              labelStyle = "bg-red-50 text-red-700 border border-red-100";
                            }

                            return (
                              <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3.5 text-center font-mono text-slate-400">{index + 1}</td>
                                <td className="px-5 py-3.5 font-bold text-slate-900">{record.studentName}</td>
                                <td className="px-5 py-3.5 text-center text-slate-500">{record.school}</td>
                                <td className="px-5 py-3.5 text-center font-semibold text-slate-700">{record.grade}</td>
                                <td className="px-5 py-3.5 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    record.gender === "남자" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                                  }`}>
                                    {record.gender}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 font-medium text-slate-800">
                                  <div className="flex flex-col">
                                    <span>{record.event}</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">{record.category}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-700">
                                  {record.measuredValue}
                                  <span className="text-[10px] text-slate-400 font-normal ml-0.5">
                                    {record.event === "왕복오래달리기" ? "회" :
                                     record.event === "50m달리기" ? "초" :
                                     record.event === "앉아윗몸앞으로굽히기" ? "cm" :
                                     record.event === "제자리멀리뛰기" ? "cm" :
                                     record.event === "체질량지수" ? "BMI" :
                                     record.event === "하버드스텝검사" ? "심박" : "단위"}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-right font-mono font-extrabold text-slate-900 text-sm">
                                  {record.score}점
                                </td>
                                <td className="px-5 py-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${labelStyle}`}>
                                    {record.gradeLabel}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-center font-mono text-slate-400 text-[10px]">{dateStr}</td>
                                <td className="px-5 py-3.5 text-center">
                                  <button
                                    onClick={() => handleDeleteEvaluation(record.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all cursor-pointer"
                                    title="기록 삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                      ) : (
                        <tr>
                          <td colSpan={11} className="px-5 py-12 text-center text-slate-400">
                            <Database className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm font-semibold">저장된 학생 평가 기록이 없습니다.</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {historySearchQuery ? "검색 필터를 변경해 보세요." : "인터랙티브 계산기에서 실측 점수를 산출한 후 저장해 보세요."}
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            
            /* INTERACTIVE PAPS CALCULATOR TABS */
            <div id="paps-calculator-container" className="flex-1 bg-white border border-slate-200 rounded-xl shadow-xs p-8 flex flex-col md:flex-row gap-8 overflow-y-auto">
              
              {/* Left Column: Calculator form */}
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">PAPS 측정 기록 점수 산출</h2>
                  <p className="text-xs text-slate-500 mt-1">학생의 학년, 성별 및 측정된 실제 기록값을 대입하여 정밀 점수(0~20점) 및 등급을 계산합니다.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">학교급</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setCalcSchool("초등학교")}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold text-center cursor-pointer transition-all ${
                          calcSchool === "초등학교" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        초등학교
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalcSchool("중학교")}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold text-center cursor-pointer transition-all ${
                          calcSchool === "중학교" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        중학교
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">학년</label>
                    <select
                      value={calcGrade}
                      onChange={(e) => setCalcGrade(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                    >
                      {calcSchool === "초등학교" ? (
                        <>
                          <option value="3학년">3학년</option>
                          <option value="4학년">4학년</option>
                          <option value="5학년">5학년</option>
                          <option value="6학년">6학년</option>
                        </>
                      ) : (
                        <>
                          <option value="1학년">1학년</option>
                          <option value="2학년">2학년</option>
                          <option value="3학년">3학년</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">성별</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setCalcGender("남자")}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold text-center cursor-pointer transition-all ${
                          calcGender === "남자" ? "bg-blue-500 text-white shadow-2xs" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        남자
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalcGender("여자")}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold text-center cursor-pointer transition-all ${
                          calcGender === "여자" ? "bg-pink-500 text-white shadow-2xs" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        여자
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">측정 종목</label>
                    <select
                      value={calcEvent}
                      onChange={(e) => setCalcEvent(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                    >
                      {availableCalcEvents.map((ev) => (
                        <option key={ev} value={ev}>
                          {ev}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      측정값 입력 (단위: {
                        calcEvent === "왕복오래달리기" ? "회" :
                        calcEvent === "50m달리기" ? "초" :
                        calcEvent === "앉아윗몸앞으로굽히기" ? "cm" :
                        calcEvent === "제자리멀리뛰기" ? "cm (예: 180)" :
                        calcEvent === "체질량지수" ? "BMI 수치 (예: 18.5)" :
                        calcEvent === "하버드스텝검사" ? "심박수 합산" :
                        calcEvent === "스텝검사" ? "PEI 지수" : "기본단위"
                      })
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={calcValue}
                        onChange={(e) => setCalcValue(e.target.value)}
                        placeholder="실측된 숫자를 입력해 주세요"
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:outline-hidden font-medium"
                      />
                      <button
                        onClick={handleCalculate}
                        className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg shadow-xs hover:shadow-md transition-all cursor-pointer"
                      >
                        계산하기
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Results */}
              <div className="w-full md:w-80 bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">산출결과 분석</h3>
                  
                  {calcResult ? (
                    <div className="text-center py-4">
                      {/* Interactive score circle */}
                      <div className="w-28 h-28 rounded-full border-4 border-green-500 flex flex-col items-center justify-center mx-auto bg-white shadow-xs">
                        <span className="text-3xl font-black text-slate-800 font-mono">{calcResult.score}</span>
                        <span className="text-[10px] text-slate-400 font-bold -mt-0.5">SCORE / 20점</span>
                      </div>

                      <div className="mt-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                          calcResult.gradeLabel.includes("1등급") || calcResult.gradeLabel === "정상"
                            ? "bg-green-100 text-green-700"
                            : calcResult.gradeLabel.includes("5등급") || calcResult.gradeLabel.includes("비만")
                            ? "bg-red-100 text-red-700"
                            : "bg-indigo-100 text-indigo-700"
                        }`}>
                          {calcResult.gradeLabel}
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium mt-1">{calcResult.pointsMsg}</p>
                      </div>

                      {user ? (
                        <div className="mt-6 pt-5 border-t border-slate-200 text-left">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            학급 평가 기록부에 저장 (Firestore)
                          </label>
                          <div className="space-y-2.5">
                            <input
                              type="text"
                              value={studentNameInput}
                              onChange={(e) => setStudentNameInput(e.target.value)}
                              placeholder="학생 이름 입력 (예: 홍길동)"
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-medium focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                            />
                            <button
                              onClick={handleSaveEvaluation}
                              disabled={savingEvaluation || !studentNameInput.trim()}
                              className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              {savingEvaluation ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>저장 중...</span>
                                </>
                              ) : (
                                <>
                                  <PlusCircle className="w-3.5 h-3.5" />
                                  <span>평가 기록 저장</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-6 pt-5 border-t border-slate-200 text-center">
                          <p className="text-[10px] text-slate-400 leading-normal">구글 로그인을 하시면 산출 결과를 학급 기록부에 영구히 기록/저장할 수 있습니다.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-400">
                      <Calculator className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-xs font-semibold">산출된 점수가 없습니다.</p>
                      <p className="text-[10px] text-slate-400 mt-1">좌측 측정 항목과 실측 데이터를 입력한 후 계산 버튼을 클릭해 주세요.</p>
                    </div>
                  )}
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-700 block mb-1">💡 도움말</span>
                  PAPS는 학생들의 비만, 유연성, 순발력, 심폐지구력, 근력/근지구력의 5가지 핵심 건강체력을 분석하는 과학적 시스템입니다.
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}
