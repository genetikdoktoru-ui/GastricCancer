// audit.ts — Writes KVKK audit trail entries to the audit_logs collection.
//
// exports: AuditAction | ResourceType | logAudit(action, resourceType, resourceId?, details?)
// used_by: src/lib/driveSync.ts | src/pages/{PatientForm,PatientList,PatientAnalytics,ExcelImport,IdentityRegistry,UserManagement,Backup}.tsx
// rules:   logAudit never throws and is a no-op when signed out; audit_logs is create-only for non-admins (firestore.rules) — never update/delete entries
// agent:   claude-code | anthropic | 2026-10-15 | codedna-init | initial CodeDNA annotation

import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from './firebase';

export type AuditAction = 'GÖRÜNTÜLEME' | 'OLUŞTURMA' | 'GÜNCELLEME' | 'SİLME' | 'DIŞA_AKTARMA' | 'İÇE_AKTARMA';
export type ResourceType = 'HASTA_FORMU' | 'KİMLİK_KAYDI' | 'SİSTEM_YEDEĞİ' | 'HASTA_LİSTESİ' | 'KİMLİK_LİSTESİ' | 'FORM_ŞEMASI' | 'HASTA_VERİTABANI' | 'ANALİZ_VE_SORGULAMA';

export const logAudit = async (
  action: AuditAction,
  resourceType: ResourceType,
  resourceId: string = 'Genel',
  details: string = ''
) => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'audit_logs'), {
      timestamp: new Date().toISOString(),
      userEmail: user.email,
      action,
      resourceType,
      resourceId,
      details
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};
