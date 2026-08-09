import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { defaultFormFields, FormField } from '../lib/schema';
import { getCurrentUserRole } from '../lib/auth-helpers';
import { getGeminiHeaders } from '../lib/gemini-config';
import { logAudit } from '../lib/audit';
import * as XLSX from 'xlsx';
import {
  Sparkles,
  Filter,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  Users,
  Brain,
  Download,
  Bookmark,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  GitCompare,
  Eye,
  Info,
  ChevronRight,
  Dna,
  ShieldAlert,
  Target,
  Activity,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export interface FilterRule {
  id: string;
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_filled' | 'is_empty' | 'in_list';
  value: string;
  logicalOp: 'AND' | 'OR';
}

export interface SavedPreset {
  id: string;
  name: string;
  rules: FilterRule[];
  createdAt: string;
}

export function PatientAnalytics() {
  const [patients, setPatients] = useState<any[]>([]);
  const [fields, setFields] = useState<FormField[]>(defaultFormFields);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'filter' | 'matching' | 'stats' | 'presets'>('filter');

  // AI Assistant state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResponse, setAiResponse] = useState<{ explanation?: string; clinicalInsight?: string } | null>(null);

  // Filter Rules state
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [quickSearchText, setQuickSearchText] = useState('');

  // Saved Presets state
  const [presetNameInput, setPresetNameInput] = useState('');
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);

  // Cohort Matching state
  const [indexPatientId, setIndexPatientId] = useState<string>('');
  const [matchAgeTolerance, setMatchAgeTolerance] = useState<number>(5);
  const [matchGender, setMatchGender] = useState<boolean>(true);
  const [matchLauren, setMatchLauren] = useState<boolean>(true);
  const [matchCDH1, setMatchCDH1] = useState<boolean>(false);
  const [matchHER2, setMatchHER2] = useState<boolean>(false);

  // Group A vs B Cohort Comparison
  const [groupAField, setGroupAField] = useState<string>('lauren_classification');
  const [groupAVal, setGroupAVal] = useState<string>('Diffüz');
  const [groupBVal, setGroupBVal] = useState<string>('İntestinal');

  // Patient detail modal
  const [selectedPatientModal, setSelectedPatientModal] = useState<any | null>(null);

  useEffect(() => {
    loadData();
    loadSavedPresets();
  }, []);

  const loadSavedPresets = () => {
    try {
      const stored = localStorage.getItem('gastro_gen_saved_queries');
      if (stored) {
        setSavedPresets(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Saved presets load error', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const role = await getCurrentUserRole();
      let q = collection(db, 'patients') as any;
      if (role !== 'admin' && auth.currentUser?.email) {
        q = query(collection(db, 'patients'), where('createdBy', '==', auth.currentUser.email));
      }
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setPatients(data);

      logAudit('GÖRÜNTÜLEME', 'ANALİZ_VE_SORGULAMA', 'Genel', 'Hasta analiz ve sorgu sayfası açıldı');
    } catch (err) {
      console.error('Patients fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // AI Natural Language Query Assistant
  // -------------------------------------------------------------
  const handleAiQuery = async (queryTextToUse?: string) => {
    const promptToSubmit = queryTextToUse || aiPrompt;
    if (!promptToSubmit || !promptToSubmit.trim()) return;

    setAiLoading(true);
    setAiError('');
    setAiResponse(null);

    try {
      const res = await fetch('/api/gemini/query-assistant', {
        method: 'POST',
        headers: getGeminiHeaders(),
        body: JSON.stringify({
          userQuery: promptToSubmit,
          formFields: fields.map(f => ({ id: f.id, label: f.label, category: f.category, options: f.options }))
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Yapay zeka sorgu asistanı yanıt veremedi.');
      }

      const data = await res.json();
      setAiResponse({
        explanation: data.explanation,
        clinicalInsight: data.clinicalInsight
      });

      if (Array.isArray(data.filters) && data.filters.length > 0) {
        const formattedRules: FilterRule[] = data.filters.map((f: any, index: number) => ({
          id: `ai_${Date.now()}_${index}`,
          fieldId: f.fieldId || 'patient_age',
          operator: f.operator || 'equals',
          value: f.value !== undefined ? String(f.value) : '',
          logicalOp: f.logicalOp === 'OR' ? 'OR' : 'AND'
        }));
        setRules(formattedRules);
      }
    } catch (err: any) {
      setAiError(err.message || 'Yapay zeka sorgusu işlenirken hata oluştu.');
    } finally {
      setAiLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Rule Builder Engine Logic
  // -------------------------------------------------------------
  const addRule = () => {
    const newRule: FilterRule = {
      id: `rule_${Date.now()}`,
      fieldId: fields[0]?.id || 'patient_age',
      operator: 'equals',
      value: '',
      logicalOp: 'AND'
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const updateRule = (id: string, patch: Partial<FilterRule>) => {
    setRules(rules.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  // Evaluation of single rule against single patient record
  const evaluateRule = (patient: any, rule: FilterRule): boolean => {
    const val = patient[rule.fieldId];
    const targetVal = rule.value.trim().toLowerCase();

    if (rule.operator === 'is_filled') {
      return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0);
    }
    if (rule.operator === 'is_empty') {
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    }

    if (val === undefined || val === null || val === '') return false;

    // Numerical evaluation
    if (!isNaN(Number(val)) && !isNaN(Number(rule.value))) {
      const pNum = Number(val);
      const tNum = Number(rule.value);
      if (rule.operator === 'equals') return pNum === tNum;
      if (rule.operator === 'not_equals') return pNum !== tNum;
      if (rule.operator === 'greater_than') return pNum > tNum;
      if (rule.operator === 'less_than') return pNum < tNum;
    }

    // Array / Multiselect evaluation
    if (Array.isArray(val)) {
      const arrayStr = val.map(v => String(v).toLowerCase());
      if (rule.operator === 'contains' || rule.operator === 'equals') {
        return arrayStr.some(v => v.includes(targetVal));
      }
      if (rule.operator === 'not_contains' || rule.operator === 'not_equals') {
        return !arrayStr.some(v => v.includes(targetVal));
      }
    }

    // String evaluation
    const strVal = String(val).toLowerCase();
    if (rule.operator === 'equals') return strVal === targetVal;
    if (rule.operator === 'not_equals') return strVal !== targetVal;
    if (rule.operator === 'contains') return strVal.includes(targetVal);
    if (rule.operator === 'not_contains') return !strVal.includes(targetVal);

    return true;
  };

  // Filtering patients list based on all rules and quick search
  const filteredPatients = useMemo(() => {
    return patients.filter(patient => {
      // Quick text search across research ID, age, notes
      if (quickSearchText.trim()) {
        const q = quickSearchText.toLowerCase();
        const matchesQuick =
          (patient.research_id && String(patient.research_id).toLowerCase().includes(q)) ||
          (patient.patient_age && String(patient.patient_age).includes(q)) ||
          (patient.clinical_notes && String(patient.clinical_notes).toLowerCase().includes(q)) ||
          (patient.lauren_classification && String(patient.lauren_classification).toLowerCase().includes(q));
        if (!matchesQuick) return false;
      }

      if (rules.length === 0) return true;

      // Group rules into AND / OR clusters
      // First rule establishes the baseline; subsequent rules evaluate with AND / OR
      let pass = evaluateRule(patient, rules[0]);

      for (let i = 1; i < rules.length; i++) {
        const rule = rules[i];
        const res = evaluateRule(patient, rule);
        if (rule.logicalOp === 'OR') {
          pass = pass || res;
        } else {
          pass = pass && res;
        }
      }

      return pass;
    });
  }, [patients, rules, quickSearchText]);

  // Preset Filters apply
  const applyPreset = (type: string) => {
    switch (type) {
      case 'hdgc':
        setRules([
          { id: '1', fieldId: 'lauren_classification', operator: 'equals', value: 'Diffüz', logicalOp: 'AND' },
          { id: '2', fieldId: 'patient_age', operator: 'less_than', value: '50', logicalOp: 'OR' },
          { id: '3', fieldId: 'cdh1_germline', operator: 'equals', value: 'Patonejik (Pozitif)', logicalOp: 'OR' }
        ]);
        break;
      case 'target':
        setRules([
          { id: '1', fieldId: 'her2_status', operator: 'contains', value: 'Pozitif', logicalOp: 'AND' },
          { id: '2', fieldId: 'cldn182', operator: 'contains', value: 'Pozitif', logicalOp: 'OR' }
        ]);
        break;
      case 'immuno':
        setRules([
          { id: '1', fieldId: 'msi_status', operator: 'contains', value: 'MSI-H', logicalOp: 'AND' },
          { id: '2', fieldId: 'ebv_ish', operator: 'equals', value: 'Pozitif', logicalOp: 'OR' },
          { id: '3', fieldId: 'pdl1_cps', operator: 'contains', value: 'CPS ≥ 5', logicalOp: 'OR' }
        ]);
        break;
      case 'correa':
        setRules([
          { id: '1', fieldId: 'h_pylori', operator: 'equals', value: 'Pozitif', logicalOp: 'AND' },
          { id: '2', fieldId: 'blood_type', operator: 'equals', value: 'A', logicalOp: 'AND' }
        ]);
        break;
      case 'lynch':
        setRules([
          { id: '1', fieldId: 'suspected_syndrome', operator: 'contains', value: 'Lynch', logicalOp: 'AND' },
          { id: '2', fieldId: 'mmr_germline', operator: 'contains', value: 'Patonejik', logicalOp: 'OR' }
        ]);
        break;
      case 'stage4':
        setRules([
          { id: '1', fieldId: 'm_stage', operator: 'contains', value: 'M1', logicalOp: 'AND' },
          { id: '2', fieldId: 'peritoneal_cytology', operator: 'contains', value: 'CY1', logicalOp: 'OR' }
        ]);
        break;
      case 'clear':
        setRules([]);
        setQuickSearchText('');
        setAiResponse(null);
        break;
    }
  };

  // Save preset to storage
  const handleSavePreset = () => {
    if (!presetNameInput.trim()) return;
    const newPreset: SavedPreset = {
      id: `preset_${Date.now()}`,
      name: presetNameInput.trim(),
      rules: [...rules],
      createdAt: new Date().toLocaleDateString('tr-TR')
    };
    const updated = [newPreset, ...savedPresets];
    setSavedPresets(updated);
    localStorage.setItem('gastro_gen_saved_queries', JSON.stringify(updated));
    setPresetNameInput('');
  };

  const handleDeletePreset = (id: string) => {
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem('gastro_gen_saved_queries', JSON.stringify(updated));
  };

  // Export filtered cohort to Excel
  const handleExportExcel = () => {
    if (filteredPatients.length === 0) return;
    const exportData = filteredPatients.map((p, index) => {
      const row: Record<string, any> = { 'Sıra No': index + 1 };
      fields.forEach(f => {
        row[f.label] = Array.isArray(p[f.id]) ? p[f.id].join(', ') : p[f.id] ?? '';
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtrelenmiş Hastalar');
    XLSX.writeFile(workbook, `GastroGen_Hasta_Sorgu_Sonuclari_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // -------------------------------------------------------------
  // Index Patient Matching Engine
  // -------------------------------------------------------------
  const indexPatient = useMemo(() => {
    return patients.find(p => p.id === indexPatientId);
  }, [patients, indexPatientId]);

  const matchedPatientsList = useMemo(() => {
    if (!indexPatient) return [];

    const refAge = Number(indexPatient.patient_age) || 0;
    const refGender = indexPatient.patient_gender;
    const refLauren = indexPatient.lauren_classification;
    const refCDH1 = indexPatient.cdh1_germline;
    const refHER2 = indexPatient.her2_status;

    return patients
      .filter(p => p.id !== indexPatient.id)
      .map(p => {
        let matchScore = 0;
        let totalWeight = 0;

        // Age match
        if (refAge > 0 && p.patient_age) {
          totalWeight += 30;
          const diff = Math.abs(Number(p.patient_age) - refAge);
          if (diff <= matchAgeTolerance) {
            matchScore += Math.max(0, 30 - diff * 2);
          }
        }

        // Gender match
        if (matchGender && refGender) {
          totalWeight += 15;
          if (p.patient_gender === refGender) matchScore += 15;
        }

        // Lauren match
        if (matchLauren && refLauren) {
          totalWeight += 25;
          if (p.lauren_classification === refLauren) matchScore += 25;
        }

        // CDH1 match
        if (matchCDH1 && refCDH1) {
          totalWeight += 15;
          if (p.cdh1_germline === refCDH1) matchScore += 15;
        }

        // HER2 match
        if (matchHER2 && refHER2) {
          totalWeight += 15;
          if (p.her2_status === refHER2) matchScore += 15;
        }

        const percentage = totalWeight > 0 ? Math.round((matchScore / totalWeight) * 100) : 0;
        return { patient: p, percentage };
      })
      .filter(m => m.percentage > 40)
      .sort((a, b) => b.percentage - a.percentage);
  }, [patients, indexPatient, matchAgeTolerance, matchGender, matchLauren, matchCDH1, matchHER2]);

  // -------------------------------------------------------------
  // Cohort A vs B Comparison Statistics
  // -------------------------------------------------------------
  const cohortA = useMemo(() => {
    return patients.filter(p => String(p[groupAField] || '').toLowerCase().includes(groupAVal.toLowerCase()));
  }, [patients, groupAField, groupAVal]);

  const cohortB = useMemo(() => {
    return patients.filter(p => String(p[groupAField] || '').toLowerCase().includes(groupBVal.toLowerCase()));
  }, [patients, groupAField, groupBVal]);

  const calcCohortStats = (cohort: any[]) => {
    if (cohort.length === 0) return { count: 0, avgAge: 0, her2Rate: 0, cdh1Rate: 0, msiRate: 0, cldnRate: 0, hpyloriRate: 0, stage4Rate: 0 };
    const ages = cohort.map(p => Number(p.patient_age)).filter(a => !isNaN(a) && a > 0);
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;

    const her2Count = cohort.filter(p => String(p.her2_status || '').toLowerCase().includes('pozitif')).length;
    const cdh1Count = cohort.filter(p => String(p.cdh1_germline || '').toLowerCase().includes('patonejik')).length;
    const msiCount = cohort.filter(p => String(p.msi_status || '').toLowerCase().includes('msi-h')).length;
    const cldnCount = cohort.filter(p => String(p.cldn182 || '').toLowerCase().includes('pozitif')).length;
    const hpyloriCount = cohort.filter(p => String(p.h_pylori || '').toLowerCase().includes('pozitif')).length;
    const stage4Count = cohort.filter(p => String(p.m_stage || '').toLowerCase().includes('m1')).length;

    return {
      count: cohort.length,
      avgAge,
      her2Rate: Math.round((her2Count / cohort.length) * 100),
      cdh1Rate: Math.round((cdh1Count / cohort.length) * 100),
      msiRate: Math.round((msiCount / cohort.length) * 100),
      cldnRate: Math.round((cldnCount / cohort.length) * 100),
      hpyloriRate: Math.round((hpyloriCount / cohort.length) * 100),
      stage4Rate: Math.round((stage4Count / cohort.length) * 100)
    };
  };

  const statsA = useMemo(() => calcCohortStats(cohortA), [cohortA]);
  const statsB = useMemo(() => calcCohortStats(cohortB), [cohortB]);

  // Overall Filtered Stats
  const filteredStats = useMemo(() => {
    if (filteredPatients.length === 0) return { avgAge: 0, her2Pos: 0, msiHPos: 0, cdh1Pos: 0, cldnPos: 0, diffuseRate: 0 };
    const ages = filteredPatients.map(p => Number(p.patient_age)).filter(a => !isNaN(a) && a > 0);
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;

    const her2Pos = filteredPatients.filter(p => String(p.her2_status || '').toLowerCase().includes('pozitif')).length;
    const msiHPos = filteredPatients.filter(p => String(p.msi_status || '').toLowerCase().includes('msi-h')).length;
    const cdh1Pos = filteredPatients.filter(p => String(p.cdh1_germline || '').toLowerCase().includes('patonejik')).length;
    const cldnPos = filteredPatients.filter(p => String(p.cldn182 || '').toLowerCase().includes('pozitif')).length;
    const diffuseCount = filteredPatients.filter(p => String(p.lauren_classification || '').toLowerCase().includes('diffüz')).length;

    return {
      avgAge,
      her2Pos: Math.round((her2Pos / filteredPatients.length) * 100),
      msiHPos: Math.round((msiHPos / filteredPatients.length) * 100),
      cdh1Pos: Math.round((cdh1Pos / filteredPatients.length) * 100),
      cldnPos: Math.round((cldnPos / filteredPatients.length) * 100),
      diffuseRate: Math.round((diffuseCount / filteredPatients.length) * 100)
    };
  }, [filteredPatients]);

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 p-6 rounded-2xl text-white shadow-xl border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-300 uppercase tracking-wider">
            <Brain className="w-4 h-4 text-blue-400" />
            <span>Yapay Zeka Destekli Analiz & Sorgulama Modülü</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Hasta Kohort Sorgu & Analiz Merkezi
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl">
            Mide kanseri araştırma veritabanında doğal dilde AI sorguları çalıştırın, çoklu kurallarla hassas filtreleme yapın, vaka-kontrol eşleştirmesi (matching) gerçekleştirin ve kohort istatistiklerini grafiklerle inceleyin.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportExcel}
            disabled={filteredPatients.length === 0}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-md flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Sonuçları Excel Yap ({filteredPatients.length})</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white p-2 rounded-xl shadow-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('filter')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'filter'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>Çoklu Filtreleme & AI Sorgulama</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-900/30 text-blue-100">
            {filteredPatients.length} / {patients.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('matching')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'matching'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <GitCompare className="w-4 h-4" />
          <span>Hasta Eşleştirme & Çapraz Kohort</span>
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'stats'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Kohort Grafikleri & İstatistikler</span>
        </button>

        <button
          onClick={() => setActiveTab('presets')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'presets'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Kayıtlı Sorgularım ({savedPresets.length})</span>
        </button>
      </div>

      {/* TAB 1: MULTI FILTERING & AI QUERY */}
      {activeTab === 'filter' && (
        <div className="space-y-6">
          {/* AI Natural Language Search Box */}
          <div className="bg-gradient-to-b from-blue-900/10 to-indigo-900/10 p-5 rounded-2xl border border-blue-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Yapay Zeka Doğal Dil Sorgu Asistanı</h3>
                  <p className="text-xs text-slate-600">Aradığınız hasta grubunu Türkçe cümlelerle yazın; Gemini AI uygun filtre kurallarını otomatik oluştursun.</p>
                </div>
              </div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                Gemini AI Power
              </span>
            </div>

            <div className="flex flex-col md:flex-row items-stretch gap-2">
              <input
                type="text"
                placeholder="Örn: 50 yaş altı, CDH1 mutasyonu olan ve Lauren tipi diffüz hastaları filtrele..."
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAiQuery()}
                className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-800 shadow-xs"
              />
              <button
                onClick={() => handleAiQuery()}
                disabled={aiLoading || !aiPrompt.trim()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sorgulanıyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>AI ile Filtrele</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick AI Suggestion Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-slate-500">Hızlı AI Sorgu Örnekleri:</span>
              <button
                onClick={() => {
                  setAiPrompt('50 yaş altı, CDH1 mutasyonu pozitif ve Lauren tipi diffüz olan hastaları getir');
                  handleAiQuery('50 yaş altı, CDH1 mutasyonu pozitif ve Lauren tipi diffüz olan hastaları getir');
                }}
                className="text-[11px] font-semibold px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 rounded-lg border border-blue-200 transition-colors"
              >
                🧬 HDGC Şüphelileri (&lt;50 Yaş & CDH1+)
              </button>
              <button
                onClick={() => {
                  setAiPrompt('HER2 3+ veya CLDN18.2 pozitif olan hedeflenebilir hastalar');
                  handleAiQuery('HER2 3+ veya CLDN18.2 pozitif olan hedeflenebilir hastalar');
                }}
                className="text-[11px] font-semibold px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 transition-colors"
              >
                🎯 Akıllı İlaç / Hedefli Tedavi (HER2 / CLDN18.2)
              </button>
              <button
                onClick={() => {
                  setAiPrompt('MSI-H, PD-L1 CPS yüksek veya EBV pozitif olan immünoterapi adayları');
                  handleAiQuery('MSI-H, PD-L1 CPS yüksek veya EBV pozitif olan immünoterapi adayları');
                }}
                className="text-[11px] font-semibold px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 rounded-lg border border-purple-200 transition-colors"
              >
                🛡️ İmmünoterapi Potansiyeli (MSI-H / PD-L1 / EBV)
              </button>
            </div>

            {/* AI Response Notice Banner */}
            {aiError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {aiResponse && (
              <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm space-y-2">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Yapay Zeka Klinik Değerlendirmesi</span>
                </div>
                {aiResponse.explanation && (
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">{aiResponse.explanation}</p>
                )}
                {aiResponse.clinicalInsight && (
                  <p className="text-[11.5px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed italic">
                    💡 <strong>Klinik Genetik Notu:</strong> {aiResponse.clinicalInsight}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Preset Clinical Cohort Buttons */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>Hazır Onkolojik & Genetik Kohort Filtreleri</span>
              </span>
              <button
                onClick={() => applyPreset('clear')}
                className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Tüm Filtreleri Temizle</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <button
                onClick={() => applyPreset('hdgc')}
                className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700 flex items-center gap-1">
                  <Dna className="w-3.5 h-3.5 text-blue-600" /> HDGC / CDH1
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Diffüz & Erken Yaş</div>
              </button>

              <button
                onClick={() => applyPreset('target')}
                className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-emerald-600" /> HER2 / CLDN18.2
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Hedefli Tedavi</div>
              </button>

              <button
                onClick={() => applyPreset('immuno')}
                className="p-3 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-xl text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-purple-700 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-purple-600" /> İmmünoterapi
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">MSI-H, PD-L1, EBV</div>
              </button>

              <button
                onClick={() => applyPreset('correa')}
                className="p-3 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-xl text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-amber-700 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-amber-600" /> Correa Riski
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">H.Pylori & A Grubu</div>
              </button>

              <button
                onClick={() => applyPreset('lynch')}
                className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" /> Lynch Sendromu
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">MMR Gen Eksikliği</div>
              </button>

              <button
                onClick={() => applyPreset('stage4')}
                className="p-3 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-rose-700 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Evre IV / M1
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Metastatik Kohort</div>
              </button>
            </div>
          </div>

          {/* Rule Builder Engine */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                  Gelişmiş Kural & Filtre Oluşturucu
                </h3>
                <p className="text-xs text-slate-500">Mide kanseri formundaki tüm parametrelere göre mantıksal VE/VEYA kuralları tanımlayın.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={addRule}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Kural Ekle</span>
                </button>
              </div>
            </div>

            {rules.length === 0 ? (
              <div className="py-8 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs">
                Henüz aktif bir filtre kuralı yok. Yukarıdaki "Kural Ekle" butonunu veya "Hazır Kohort" filtrelerini kullanabilirsiniz.
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule, idx) => {
                  const targetField = fields.find(f => f.id === rule.fieldId);
                  const hasSelectOptions = targetField && (targetField.type === 'select' || targetField.type === 'multiselect') && targetField.options;

                  return (
                    <div
                      key={rule.id}
                      className="flex flex-col md:flex-row items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 transition-all hover:border-blue-300"
                    >
                      {/* Logical operator selector (for subsequent rules) */}
                      {idx > 0 ? (
                        <select
                          value={rule.logicalOp}
                          onChange={e => updateRule(rule.id, { logicalOp: e.target.value as 'AND' | 'OR' })}
                          className="px-2.5 py-1.5 bg-indigo-600 text-white font-extrabold text-xs rounded-lg outline-none cursor-pointer shadow-xs"
                        >
                          <option value="AND">VE (AND)</option>
                          <option value="OR">VEYA (OR)</option>
                        </select>
                      ) : (
                        <span className="px-2.5 py-1.5 bg-slate-800 text-white font-extrabold text-xs rounded-lg">
                          BAŞLANGIÇ
                        </span>
                      )}

                      {/* Field selector */}
                      <select
                        value={rule.fieldId}
                        onChange={e => updateRule(rule.id, { fieldId: e.target.value, value: '' })}
                        className="flex-1 min-w-[200px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {fields.map(f => (
                          <option key={f.id} value={f.id}>
                            [{f.category}] {f.label}
                          </option>
                        ))}
                      </select>

                      {/* Operator selector */}
                      <select
                        value={rule.operator}
                        onChange={e => updateRule(rule.id, { operator: e.target.value as any })}
                        className="w-36 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="equals">Eşittir (=)</option>
                        <option value="not_equals">Eşit Değildir (≠)</option>
                        <option value="contains">İçerir</option>
                        <option value="not_contains">İçermez</option>
                        <option value="greater_than">Büyüktür (&gt;)</option>
                        <option value="less_than">Küçüktür (&lt;)</option>
                        <option value="is_filled">Veri Girilmiş (Dolu)</option>
                        <option value="is_empty">Veri Yok (Boş)</option>
                      </select>

                      {/* Value Input or Select Dropdown */}
                      {rule.operator !== 'is_filled' && rule.operator !== 'is_empty' && (
                        hasSelectOptions ? (
                          <select
                            value={rule.value}
                            onChange={e => updateRule(rule.id, { value: e.target.value })}
                            className="flex-1 min-w-[180px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Değer Seçin --</option>
                            {targetField.options?.map(opt => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Değer girin..."
                            value={rule.value}
                            onChange={e => updateRule(rule.id, { value: e.target.value })}
                            className="flex-1 min-w-[180px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )
                      )}

                      {/* Remove Rule button */}
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        title="Kuralı Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save Query Preset Row */}
            {rules.length > 0 && (
              <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Sorgunuza İsim Verin (Örn: HDGC Adayları)..."
                    value={presetNameInput}
                    onChange={e => setPresetNameInput(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetNameInput.trim()}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors shrink-0 flex items-center gap-1"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Sorguyu Kaydet</span>
                  </button>
                </div>

                <div className="text-xs font-bold text-slate-600">
                  Eşleşen Hasta: <span className="text-blue-600 font-extrabold text-sm">{filteredPatients.length}</span> / {patients.length}
                </div>
              </div>
            )}
          </div>

          {/* Summary Biomarker Quick Metrics for Filtered Patients */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Eşleşen Kayıt</span>
              <div className="text-xl font-black text-slate-900 mt-1">{filteredPatients.length}</div>
              <span className="text-[10px] text-slate-400">Toplam {patients.length} hastadan</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Ortalama Tanı Yaşı</span>
              <div className="text-xl font-black text-blue-600 mt-1">{filteredStats.avgAge || '-'}</div>
              <span className="text-[10px] text-slate-400">Yaş dağılımı</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">HER2 Pozitiflik</span>
              <div className="text-xl font-black text-emerald-600 mt-1">%{filteredStats.her2Pos}</div>
              <span className="text-[10px] text-slate-400">Hedefli tedavi adayı</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">CDH1 Mutasyonu</span>
              <div className="text-xl font-black text-indigo-600 mt-1">%{filteredStats.cdh1Pos}</div>
              <span className="text-[10px] text-slate-400">HDGC genetik yatkınlık</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">MSI-H Oranı</span>
              <div className="text-xl font-black text-purple-600 mt-1">%{filteredStats.msiHPos}</div>
              <span className="text-[10px] text-slate-400">İmmünoterapi yanıtı</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Diffüz Lauren %</span>
              <div className="text-xl font-black text-amber-600 mt-1">%{filteredStats.diffuseRate}</div>
              <span className="text-[10px] text-slate-400">Lauren histolojisi</span>
            </div>
          </div>

          {/* Filtered Patient Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Filtrelenen Hasta Kohortu ({filteredPatients.length})
                </h3>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Kod, Yaş veya Not ara..."
                  value={quickSearchText}
                  onChange={e => setQuickSearchText(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Hasta verileri yükleniyor...</span>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Belirtilen filtre kriterlerine uyan hasta bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      <th className="p-3.5">Araştırma Kodu</th>
                      <th className="p-3.5">Yaş & Cinsiyet</th>
                      <th className="p-3.5">Lauren Tipi</th>
                      <th className="p-3.5">Genetik & Biyobelirteçler</th>
                      <th className="p-3.5">Evre (TNM)</th>
                      <th className="p-3.5 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs text-slate-800">
                    {filteredPatients.map(patient => (
                      <tr key={patient.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-3.5 font-bold text-blue-700">
                          {patient.research_id || 'GST-UNNAMED'}
                        </td>

                        <td className="p-3.5">
                          <span className="font-semibold text-slate-900">{patient.patient_age ? `${patient.patient_age} Yaş` : '-'}</span>
                          {patient.patient_gender && <span className="ml-1 text-slate-500">({patient.patient_gender})</span>}
                        </td>

                        <td className="p-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            patient.lauren_classification === 'Diffüz' 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : patient.lauren_classification === 'İntestinal'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {patient.lauren_classification || 'Belirtilmedi'}
                          </span>
                        </td>

                        <td className="p-3.5 space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {patient.cdh1_germline && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                String(patient.cdh1_germline).includes('Patonejik')
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                CDH1: {patient.cdh1_germline}
                              </span>
                            )}

                            {patient.her2_status && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                String(patient.her2_status).includes('Pozitif')
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                HER2: {patient.her2_status}
                              </span>
                            )}

                            {patient.msi_status && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                String(patient.msi_status).includes('MSI-H')
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {patient.msi_status}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="font-mono text-slate-700">
                            {[patient.t_stage, patient.n_stage, patient.m_stage].filter(Boolean).join(' ') || '-'}
                          </span>
                        </td>

                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => setSelectedPatientModal(patient)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Önizle</span>
                          </button>

                          <Link
                            to={`/patients/${patient.id}`}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                          >
                            <span>Düzenle</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PATIENT MATCHING & COHORT COMPARISON */}
      {activeTab === 'matching' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Index Patient Selection Panel */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-3">
                <Target className="w-5 h-5 text-blue-600" />
                <h3>1. Referans (İndeks) Hasta Seçin</h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Referans Hasta:</label>
                <select
                  value={indexPatientId}
                  onChange={e => setIndexPatientId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Bir Hasta Seçin --</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.research_id || p.id} ({p.patient_age ? `${p.patient_age} Yaş` : 'Yaş yok'}, {p.lauren_classification || 'Lauren yok'})
                    </option>
                  ))}
                </select>
              </div>

              {indexPatient && (
                <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-1.5 text-xs text-slate-800">
                  <div className="font-bold text-blue-900">{indexPatient.research_id} Bilgileri:</div>
                  <div>• <strong>Tanı Yaşı:</strong> {indexPatient.patient_age || '-'}</div>
                  <div>• <strong>Cinsiyet:</strong> {indexPatient.patient_gender || '-'}</div>
                  <div>• <strong>Lauren Tipi:</strong> {indexPatient.lauren_classification || '-'}</div>
                  <div>• <strong>CDH1:</strong> {indexPatient.cdh1_germline || '-'}</div>
                  <div>• <strong>HER2:</strong> {indexPatient.her2_status || '-'}</div>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Eşleştirme Kriterleri:</h4>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Yaş Toleransı (± Yaş):</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={matchAgeTolerance}
                    onChange={e => setMatchAgeTolerance(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchGender}
                      onChange={e => setMatchGender(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Cinsiyet Eşleşmesi Zorunlu Olsun</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchLauren}
                      onChange={e => setMatchLauren(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Lauren Histolojisi Aynı Olsun</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchCDH1}
                      onChange={e => setMatchCDH1(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>CDH1 Mutasyon Durumu Aynı Olsun</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={matchHER2}
                      onChange={e => setMatchHER2(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>HER2 Biyobelirteç Durumu Aynı Olsun</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Matched Control Patients Results */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <GitCompare className="w-5 h-5 text-emerald-600" />
                  <h3>2. Eşleşen Kontrol Vakaları ({matchedPatientsList.length})</h3>
                </div>
                {indexPatient && (
                  <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200">
                    Referans: {indexPatient.research_id}
                  </span>
                )}
              </div>

              {!indexPatient ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  Eşleşen kontrol vakalarını görmek için soldan bir referans (indeks) hasta seçin.
                </div>
              ) : matchedPatientsList.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  Bu kritere ve yaş toleransına uyan benzer kontrol hastası bulunamadı. Toleransı artırmayı deneyebilirsiniz.
                </div>
              ) : (
                <div className="space-y-3">
                  {matchedPatientsList.map(({ patient, percentage }) => (
                    <div
                      key={patient.id}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-300 transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{patient.research_id || 'Hasta'}</span>
                          <span className="text-xs font-semibold text-slate-600">
                            {patient.patient_age} Yaş, {patient.patient_gender || 'Cinsiyet yok'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap gap-2">
                          <span>Lauren: <strong>{patient.lauren_classification || '-'}</strong></span> |
                          <span>CDH1: <strong>{patient.cdh1_germline || '-'}</strong></span> |
                          <span>HER2: <strong>{patient.her2_status || '-'}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-500">Uyum Oranı</div>
                          <div className="text-lg font-black text-emerald-600">%{percentage}</div>
                        </div>

                        <button
                          onClick={() => setSelectedPatientModal(patient)}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                        >
                          İncele
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Group A vs B Cohort Side-by-Side Comparison */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Çapraz Kohort Karşılaştırması (Grup A vs Grup B)
                </h3>
                <p className="text-xs text-slate-500">İki ayrı hasta grubunu klinik ve biyobelirteç oranları açısından yan yana karşılaştırın.</p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={groupAField}
                  onChange={e => setGroupAField(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="lauren_classification">Lauren Tipi (Diffüz vs İntestinal)</option>
                  <option value="h_pylori">H. Pylori (Pozitif vs Negatif)</option>
                  <option value="m_stage">Metastaz (M1 vs M0)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Group A */}
              <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-200 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
                  <span className="font-black text-sm text-blue-900 uppercase">Grup A: {groupAVal}</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-200 text-blue-900">
                    {statsA.count} Hasta
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-800">
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>Ortalama Tanı Yaşı:</span>
                    <strong className="text-slate-900">{statsA.avgAge} Yaş</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>CDH1 Mutasyon Oranı:</span>
                    <strong className="text-indigo-700">%{statsA.cdh1Rate}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>HER2 Pozitiflik Oranı:</span>
                    <strong className="text-emerald-700">%{statsA.her2Rate}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-blue-100">
                    <span>MSI-H Yüksek Oranı:</span>
                    <strong className="text-purple-700">%{statsA.msiRate}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Evre IV (M1) Oranı:</span>
                    <strong className="text-rose-700">%{statsA.stage4Rate}</strong>
                  </div>
                </div>
              </div>

              {/* Group B */}
              <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                  <span className="font-black text-sm text-emerald-900 uppercase">Grup B: {groupBVal}</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                    {statsB.count} Hasta
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-800">
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>Ortalama Tanı Yaşı:</span>
                    <strong className="text-slate-900">{statsB.avgAge} Yaş</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>CDH1 Mutasyon Oranı:</span>
                    <strong className="text-indigo-700">%{statsB.cdh1Rate}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>HER2 Pozitiflik Oranı:</span>
                    <strong className="text-emerald-700">%{statsB.her2Rate}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-100">
                    <span>MSI-H Yüksek Oranı:</span>
                    <strong className="text-purple-700">%{statsB.msiRate}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Evre IV (M1) Oranı:</span>
                    <strong className="text-rose-700">%{statsB.stage4Rate}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VISUAL STATS & CHARTS */}
      {activeTab === 'stats' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Görsel Kohort İstatistikleri ({filteredPatients.length} Eşleşen Kayıt)
            </h3>
            <p className="text-xs text-slate-500">Mevcut filtrelerinize uyan hastaların oran ve dağılım grafikleri.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Lauren Distribution */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Lauren Klasifikasyonu Dağılımı</h4>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1 font-semibold">
                    <span>Diffüz Tipi (E-Cadherin Kaybı)</span>
                    <span className="text-rose-700 font-bold">%{filteredStats.diffuseRate}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${filteredStats.diffuseRate}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Biomarker Co-positivity */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Biyobelirteç Pozitiflik Dağılımı</h4>
              <div className="space-y-2.5 text-xs font-semibold">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>HER2 Pozitif (Trastuzumab Adayı)</span>
                    <span className="text-emerald-700 font-bold">%{filteredStats.her2Pos}</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${filteredStats.her2Pos}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>CDH1 Germline Mutasyonu (HDGC)</span>
                    <span className="text-indigo-700 font-bold">%{filteredStats.cdh1Pos}</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${filteredStats.cdh1Pos}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>MSI-H (İmmünoterapi Yanıtlı)</span>
                    <span className="text-purple-700 font-bold">%{filteredStats.msiHPos}</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${filteredStats.msiHPos}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SAVED PRESETS */}
      {activeTab === 'presets' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-blue-600" />
                Kayıtlı Özel Sorgularım
              </h3>
              <p className="text-xs text-slate-500">Sık kullandığınız karmaşık filtreleri tek tıkla tekrar yükleyin.</p>
            </div>
          </div>

          {savedPresets.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Henüz kaydedilmiş özel sorgunuz yok. "Çoklu Filtreleme" sekmesinde kural oluşturduktan sonra kaydedebilirsiniz.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedPresets.map(preset => (
                <div key={preset.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{preset.name}</span>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="text-xs text-slate-600">
                    {preset.rules.length} kural içeriyor • {preset.createdAt}
                  </div>

                  <button
                    onClick={() => {
                      setRules(preset.rules);
                      setActiveTab('filter');
                    }}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Sorguyu Yükle & Çalıştır</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patient Detail Modal Preview */}
      {selectedPatientModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">{selectedPatientModal.research_id || 'Hasta Detayı'}</h3>
                <p className="text-xs text-slate-400">GastroGen Araştırma Formu Kaydı</p>
              </div>
              <button
                onClick={() => setSelectedPatientModal(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-300"
              >
                Kapat (ESC)
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-800">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div><strong>Tanı Yaşı:</strong> {selectedPatientModal.patient_age || '-'}</div>
                <div><strong>Cinsiyet:</strong> {selectedPatientModal.patient_gender || '-'}</div>
                <div><strong>Etnik Köken:</strong> {selectedPatientModal.ethnicity || '-'}</div>
                <div><strong>Kan Grubu:</strong> {selectedPatientModal.blood_type || '-'}</div>
                <div><strong>H. Pylori:</strong> {selectedPatientModal.h_pylori || '-'}</div>
                <div><strong>Lauren Tipi:</strong> {selectedPatientModal.lauren_classification || '-'}</div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 border-b pb-1">Biyobelirteçler & Genetik:</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>CDH1:</strong> {selectedPatientModal.cdh1_germline || 'Bakılmadı'}</div>
                  <div><strong>HER2:</strong> {selectedPatientModal.her2_status || 'Bakılmadı'}</div>
                  <div><strong>MSI:</strong> {selectedPatientModal.msi_status || 'Bakılmadı'}</div>
                  <div><strong>CLDN18.2:</strong> {selectedPatientModal.cldn182 || 'Bakılmadı'}</div>
                  <div><strong>EBV (ISH):</strong> {selectedPatientModal.ebv_ish || 'Bakılmadı'}</div>
                  <div><strong>TNM Evresi:</strong> {[selectedPatientModal.t_stage, selectedPatientModal.n_stage, selectedPatientModal.m_stage].filter(Boolean).join(' ') || '-'}</div>
                </div>
              </div>

              {selectedPatientModal.clinical_notes && (
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900">Klinik Notlar / Ekstre:</h4>
                  <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-[11px] whitespace-pre-wrap">
                    {selectedPatientModal.clinical_notes}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <Link
                to={`/patients/${selectedPatientModal.id}`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl"
              >
                Tam Formu Aç & Düzenle
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
