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
