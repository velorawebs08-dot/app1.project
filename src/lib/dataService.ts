import { supabase } from './supabase';

export const TEST_PAPERS_BUCKET = 'test-papers';

export interface Student {
  id: string;
  name: string;
  standard: '10th';
  joiningDate: string;
  status: 'active' | 'left';
  parentId?: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentWhatsapp?: string;
}

export interface Test {
  id: string;
  title: string;
  subject: string;
  testDate: string;
  totalMarks: number;
  fileName?: string;
  fileType?: string;
  filePath?: string;
}

export interface TestInput {
  title: string;
  subject: string;
  testDate: string;
  totalMarks: number;
  file?: File | null;
  fileName?: string;
  fileType?: string;
  filePath?: string;
  removeFile?: boolean;
}

export interface NormalizedTestFile {
  fileName: string;
  fileType: string;
  filePath: string;
}

export interface Mark {
  id: string;
  testId: string;
  studentId: string;
  marksObtained: number;
  remark?: string;
}

export interface StudentMarkDetail extends Mark {
  test: Test;
}

export interface SaveMarkRow {
  studentId: string;
  marksObtained: number;
  remark?: string;
}

export type ResolvedUserRole =
  | { role: 'admin'; email?: string }
  | { role: 'parent'; studentId: string; studentIds: string[]; email?: string };

function mapStudentRow(row: Record<string, unknown>): Student {
  const rawParent = Array.isArray(row.parents)
    ? (row.parents[0] as Record<string, unknown> | undefined)
    : (row.parents as Record<string, unknown> | undefined);

  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? row.student_name ?? ''),
    standard: '10th',
    joiningDate: String(row.joining_date ?? row.joiningDate ?? ''),
    status: row.status === 'left' ? 'left' : 'active',
    parentId:
      row.parent_id !== undefined && row.parent_id !== null
        ? String(row.parent_id)
        : rawParent?.id !== undefined
          ? String(rawParent.id)
          : undefined,
    parentName: String(
      rawParent?.name ??
        rawParent?.full_name ??
        row.parent_name ??
        row.parentName ??
        ''
    ),
    parentEmail: String(
      rawParent?.email ?? row.parent_email ?? row.parentEmail ?? ''
    ),
    parentPhone: String(
      rawParent?.phone ?? row.parent_phone ?? row.parentPhone ?? ''
    ),
    parentWhatsapp:
      (rawParent?.whatsapp_number ?? undefined) as string | undefined,
  };
}

function mapTestRow(row: Record<string, unknown>): Test {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    subject: String(row.subject ?? ''),
    testDate: String(row.test_date ?? row.testDate ?? ''),
    totalMarks: Number(row.total_marks ?? row.totalMarks ?? 0),
    fileName: (row.file_name ?? undefined) as string | undefined,
    fileType: (row.file_type ?? undefined) as string | undefined,
    filePath: (row.file_path ?? undefined) as string | undefined,
  };
}

function mapMarkRow(row: Record<string, unknown>): Mark {
  return {
    id: String(row.id ?? ''),
    testId: String(row.test_id ?? row.testId ?? ''),
    studentId: String(row.student_id ?? row.studentId ?? ''),
    marksObtained: Number(row.marks_obtained ?? row.marksObtained ?? 0),
    remark: (row.remark ?? undefined) as string | undefined,
  };
}

export async function linkAccountAndResolveSession(): Promise<ResolvedUserRole> {
  const { data: linkData, error: linkError } = await supabase.rpc(
    'link_my_account'
  );
  if (linkError) {
    console.error('Supabase link_my_account RPC error:', linkError);
    throw new Error(linkError.message || 'Failed to link account');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error('Supabase auth.getUser error:', userError);
    throw new Error(userError?.message || 'Unable to verify authenticated user');
  }

  // 1. Check direct return value from link_my_account()
  if (linkData && typeof linkData === 'object') {
    const obj = Array.isArray(linkData) ? linkData[0] : linkData;
    if (obj && typeof obj === 'object') {
      const rec = obj as Record<string, unknown>;
      const roleVal = String(rec.role ?? '').toLowerCase();
      if (roleVal === 'admin' || roleVal === 'teacher') {
        return { role: 'admin', email: user.email };
      }
      if (roleVal === 'parent') {
        const sid = rec.student_id ?? rec.studentId;
        if (sid) {
          return {
            role: 'parent',
            studentId: String(sid),
            studentIds: [String(sid)],
            email: user.email,
          };
        }
      }
    }
  } else if (
    typeof linkData === 'string' &&
    (linkData.toLowerCase() === 'admin' || linkData.toLowerCase() === 'teacher')
  ) {
    return { role: 'admin', email: user.email };
  }

  // 2. Check metadata role
  const metaRole = String(
    user.app_metadata?.role ?? user.user_metadata?.role ?? ''
  ).toLowerCase();
  if (metaRole === 'admin' || metaRole === 'teacher') {
    return { role: 'admin', email: user.email };
  }

  // 3. Check profiles table if it exists
  const profileRes = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profileRes.error && profileRes.data) {
    const pRole = String(
      (profileRes.data as Record<string, unknown>).role ?? ''
    ).toLowerCase();
    if (pRole === 'admin' || pRole === 'teacher') {
      return { role: 'admin', email: user.email };
    }
  }

  // 4. Check teachers / admins table if it exists
  if (user.email) {
    const teacherRes = await supabase
      .from('teachers')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    if (!teacherRes.error && teacherRes.data) {
      return { role: 'admin', email: user.email };
    }
  }

  // 5. Check parents -> students
  const parentByUserRes = await supabase
    .from('parents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let parentId: string | null = null;
  if (!parentByUserRes.error && parentByUserRes.data) {
    parentId = String((parentByUserRes.data as Record<string, unknown>).id);
  } else if (user.email) {
    const parentByEmailRes = await supabase
      .from('parents')
      .select('id')
      .ilike('email', user.email)
      .maybeSingle();
    if (!parentByEmailRes.error && parentByEmailRes.data) {
      parentId = String((parentByEmailRes.data as Record<string, unknown>).id);
    }
  }

  if (parentId) {
    const stuRes = await supabase
      .from('students')
      .select('id')
      .eq('parent_id', parentId)
      .order('name', { ascending: true });
    if (stuRes.error) {
      console.error('Error loading parent students:', stuRes.error);
      throw new Error(stuRes.error.message);
    }
    const ids = (stuRes.data ?? []).map((r) =>
      String((r as Record<string, unknown>).id)
    );
    if (ids.length > 0) {
      return {
        role: 'parent',
        studentId: ids[0],
        studentIds: ids,
        email: user.email,
      };
    }
  }

  return { role: 'admin', email: user.email };
}

export async function getStudents(): Promise<Student[]> {
  const joined = await supabase
    .from('students')
    .select('*, parents(*)')
    .order('name', { ascending: true });

  if (!joined.error) {
    return (joined.data ?? []).map((row) =>
      mapStudentRow(row as Record<string, unknown>)
    );
  }

  if (joined.error.code === 'PGRST200') {
    const flat = await supabase
      .from('students')
      .select('*')
      .order('name', { ascending: true });
    if (flat.error) {
      console.error('Supabase getStudents error:', flat.error);
      throw new Error(flat.error.message || 'Failed to load students');
    }
    return (flat.data ?? []).map((row) =>
      mapStudentRow(row as Record<string, unknown>)
    );
  }

  console.error('Supabase getStudents error:', joined.error);
  throw new Error(joined.error.message || 'Failed to load students');
}

export async function addStudent(
  data: Omit<Student, 'id' | 'status'> & { status?: 'active' | 'left' }
): Promise<void> {
  const { error } = await supabase.rpc('add_student_with_parent', {
    p_student_name: data.name.trim(),
    p_joining_date: data.joiningDate,
    p_parent_name: data.parentName.trim(),
    p_email: data.parentEmail.trim().toLowerCase(),
    p_phone: data.parentPhone.trim(),
    p_whatsapp: data.parentWhatsapp?.trim() || null,
  });

  if (error) {
    console.error('Supabase add_student_with_parent RPC error:', error);
    throw new Error(error.message || 'Failed to add student');
  }
}

export async function updateStudent(
  id: string,
  data: Partial<Omit<Student, 'id'>> & { parentId?: string }
): Promise<Student> {
  const studentPatch: Record<string, unknown> = {};
  if (data.name !== undefined) studentPatch.name = data.name.trim();
  if (data.joiningDate !== undefined) studentPatch.joining_date = data.joiningDate;
  if (data.status !== undefined) studentPatch.status = data.status;

  if (Object.keys(studentPatch).length > 0) {
    const { error } = await supabase
      .from('students')
      .update(studentPatch)
      .eq('id', id);
    if (error) {
      console.error('Supabase updateStudent (students) error:', error);
      throw new Error(error.message || 'Failed to update student');
    }
  }

  const hasParentFields =
    data.parentName !== undefined ||
    data.parentEmail !== undefined ||
    data.parentPhone !== undefined ||
    data.parentWhatsapp !== undefined;

  if (hasParentFields) {
    const parentPatch: Record<string, unknown> = {};
    if (data.parentName !== undefined) parentPatch.name = data.parentName.trim();
    if (data.parentEmail !== undefined) {
      parentPatch.email = data.parentEmail.trim().toLowerCase();
    }
    if (data.parentPhone !== undefined) parentPatch.phone = data.parentPhone.trim();
    if (data.parentWhatsapp !== undefined) {
      parentPatch.whatsapp_number = data.parentWhatsapp?.trim() || null;
    }

    if (data.parentId) {
      const { error } = await supabase
        .from('parents')
        .update(parentPatch)
        .eq('id', data.parentId);
      if (error) {
        console.error('Supabase updateStudent (parents) error:', error);
        throw new Error(error.message || 'Failed to update parent details');
      }
    } else {
      const { data: updatedByStudent, error: byStudentErr } = await supabase
        .from('parents')
        .update(parentPatch)
        .eq('student_id', id)
        .select('id');

      if (byStudentErr) {
        console.error(
          'Supabase updateStudent (parents by student_id) error:',
          byStudentErr
        );
        throw new Error(
          byStudentErr.message || 'Failed to update parent details'
        );
      }

      if (!updatedByStudent || updatedByStudent.length === 0) {
        const { data: stuRow, error: fetchErr } = await supabase
          .from('students')
          .select('parent_id')
          .eq('id', id)
          .maybeSingle();

        if (fetchErr) {
          console.error('Supabase fetch parent_id error:', fetchErr);
          throw new Error(
            fetchErr.message || 'Failed to update parent details'
          );
        }

        const pid = (stuRow as Record<string, unknown> | null)?.parent_id;
        if (pid) {
          const { error } = await supabase
            .from('parents')
            .update(parentPatch)
            .eq('id', String(pid));
          if (error) {
            console.error('Supabase updateStudent (parents) error:', error);
            throw new Error(error.message || 'Failed to update parent details');
          }
        }
      }
    }
  }

  const list = await getStudents();
  const updated = list.find((s) => s.id === id);
  if (!updated) {
    throw new Error('Student not found after update');
  }
  return updated;
}

export async function setStudentStatus(
  id: string,
  status: 'active' | 'left'
): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Supabase setStudentStatus error:', error);
    throw new Error(error.message || 'Failed to update student status');
  }
}

export async function getTests(): Promise<Test[]> {
  const { data, error } = await supabase
    .from('tests')
    .select(
      'id, title, subject, test_date, total_marks, file_name, file_type, file_path'
    )
    .order('test_date', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    console.error('Supabase getTests error:', error);
    throw new Error(error.message || 'Failed to load tests');
  }

  return (data ?? []).map((row) => mapTestRow(row as Record<string, unknown>));
}

export function getTestFile(test: Test): NormalizedTestFile | null {
  if (!test.filePath) return null;

  const fileType = test.fileType || 'application/pdf';
  const fileName =
    test.fileName ||
    (fileType.startsWith('image/') ? 'test-paper.jpg' : 'test-paper.pdf');

  return { fileName, fileType, filePath: test.filePath };
}

async function uploadTestPaperFile(
  testId: string,
  file: File,
  fileName: string,
  fileType: string
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${testId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(TEST_PAPERS_BUCKET)
    .upload(filePath, file, {
      contentType: fileType,
      upsert: false,
    });

  if (error) {
    console.error('Supabase storage upload error:', error);
    throw new Error(error.message || 'Failed to upload test paper');
  }

  return filePath;
}

export async function addTest(data: TestInput): Promise<Test> {
  const testId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  let fileName: string | null = null;
  let fileType: string | null = null;
  let filePath: string | null = null;

  if (data.file) {
    fileName = data.fileName || data.file.name;
    fileType = data.fileType || data.file.type || 'application/pdf';
    filePath = await uploadTestPaperFile(testId, data.file, fileName, fileType);
  }

  const { data: inserted, error } = await supabase
    .from('tests')
    .insert({
      title: data.title.trim(),
      subject: data.subject,
      test_date: data.testDate,
      total_marks: Number(data.totalMarks),
      file_name: fileName,
      file_type: fileType,
      file_path: filePath,
    })
    .select(
      'id, title, subject, test_date, total_marks, file_name, file_type, file_path'
    )
    .single();

  if (error || !inserted) {
    if (filePath) {
      await supabase.storage.from(TEST_PAPERS_BUCKET).remove([filePath]);
    }
    console.error('Supabase addTest error:', error);
    throw new Error(error?.message || 'Failed to create test');
  }

  return mapTestRow(inserted as Record<string, unknown>);
}

export async function updateTest(
  id: string,
  data: Partial<TestInput>
): Promise<Test> {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.subject !== undefined) patch.subject = data.subject;
  if (data.testDate !== undefined) patch.test_date = data.testDate;
  if (data.totalMarks !== undefined) patch.total_marks = Number(data.totalMarks);

  const oldPath = data.filePath;
  let uploadedPath: string | null = null;

  if (data.file) {
    const fileName = data.fileName || data.file.name;
    const fileType = data.fileType || data.file.type || 'application/pdf';
    uploadedPath = await uploadTestPaperFile(id, data.file, fileName, fileType);
    patch.file_name = fileName;
    patch.file_type = fileType;
    patch.file_path = uploadedPath;
  } else if (data.removeFile) {
    patch.file_name = null;
    patch.file_type = null;
    patch.file_path = null;
  }

  const { data: updated, error } = await supabase
    .from('tests')
    .update(patch)
    .eq('id', id)
    .select(
      'id, title, subject, test_date, total_marks, file_name, file_type, file_path'
    )
    .single();

  if (error || !updated) {
    if (uploadedPath) {
      await supabase.storage.from(TEST_PAPERS_BUCKET).remove([uploadedPath]);
    }
    console.error('Supabase updateTest error:', error);
    throw new Error(error?.message || 'Failed to update test');
  }

  if ((uploadedPath || data.removeFile) && oldPath && oldPath !== uploadedPath) {
    await supabase.storage.from(TEST_PAPERS_BUCKET).remove([oldPath]);
  }

  return mapTestRow(updated as Record<string, unknown>);
}

export async function deleteTest(id: string): Promise<void> {
  const { data: existing } = await supabase
    .from('tests')
    .select('file_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('tests').delete().eq('id', id);
  if (error) {
    console.error('Supabase deleteTest error:', error);
    throw new Error(error.message || 'Failed to delete test');
  }

  const oldPath = (existing as Record<string, unknown> | null)?.file_path;
  if (typeof oldPath === 'string' && oldPath) {
    await supabase.storage.from(TEST_PAPERS_BUCKET).remove([oldPath]);
  }
}

export async function downloadTestPaperBlob(
  filePath: string,
  fileType?: string
): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(TEST_PAPERS_BUCKET)
    .download(filePath);

  if (error || !data) {
    console.error('Supabase storage download error:', error);
    throw new Error(error?.message || 'Failed to load test paper file');
  }

  if (fileType && data.type !== fileType) {
    return new Blob([data], { type: fileType });
  }
  return data;
}

export async function getMarksForTest(testId: string): Promise<Mark[]> {
  const { data, error } = await supabase
    .from('marks')
    .select('*')
    .eq('test_id', testId);

  if (error) {
    console.error('Supabase getMarksForTest error:', error);
    throw new Error(error.message || 'Failed to load marks for test');
  }

  return (data ?? []).map((row) => mapMarkRow(row as Record<string, unknown>));
}

export async function saveMarks(
  testId: string,
  rows: SaveMarkRow[]
): Promise<Mark[]> {
  const { data: testRow, error: testError } = await supabase
    .from('tests')
    .select('id, total_marks')
    .eq('id', testId)
    .single();

  if (testError || !testRow) {
    console.error('Supabase saveMarks test lookup error:', testError);
    throw new Error(testError?.message || 'Selected test not found');
  }

  const totalMarks = Number((testRow as Record<string, unknown>).total_marks);
  for (const row of rows) {
    if (
      typeof row.marksObtained !== 'number' ||
      Number.isNaN(row.marksObtained) ||
      row.marksObtained < 0 ||
      row.marksObtained > totalMarks
    ) {
      throw new Error(
        `Invalid marks (${row.marksObtained}). Must be between 0 and ${totalMarks}.`
      );
    }
  }

  const [
    { data: existingMarks, error: existingErr },
    { data: activeStudents, error: stuErr },
  ] = await Promise.all([
    supabase.from('marks').select('*').eq('test_id', testId),
    supabase.from('students').select('id').eq('status', 'active'),
  ]);

  if (existingErr) {
    console.error('Supabase saveMarks read existing error:', existingErr);
    throw new Error(existingErr.message || 'Failed to load existing marks');
  }
  if (stuErr) {
    console.error('Supabase saveMarks read active students error:', stuErr);
    throw new Error(stuErr.message || 'Failed to load active students');
  }

  const activeSet = new Set(
    (activeStudents ?? []).map((s) => String((s as Record<string, unknown>).id))
  );
  const existingByStudent = new Map<string, string>();
  for (const m of existingMarks ?? []) {
    const rec = m as Record<string, unknown>;
    existingByStudent.set(String(rec.student_id), String(rec.id));
  }

  const incomingSet = new Set(rows.map((r) => r.studentId));
  const idsToDelete: string[] = [];
  for (const [stuId, markId] of existingByStudent.entries()) {
    if (activeSet.has(stuId) && !incomingSet.has(stuId)) {
      idsToDelete.push(markId);
    }
  }

  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('marks')
      .delete()
      .in('id', idsToDelete);
    if (delErr) {
      console.error('Supabase saveMarks delete cleared error:', delErr);
      throw new Error(delErr.message || 'Failed to remove cleared marks');
    }
  }

  const toUpdate: Array<{
    id: string;
    marks_obtained: number;
    remark: string | null;
  }> = [];
  const toInsert: Array<{
    test_id: string;
    student_id: string;
    marks_obtained: number;
    remark: string | null;
  }> = [];

  for (const row of rows) {
    const existingId = existingByStudent.get(row.studentId);
    const remarkVal = row.remark?.trim() ? row.remark.trim() : null;
    if (existingId) {
      toUpdate.push({
        id: existingId,
        marks_obtained: row.marksObtained,
        remark: remarkVal,
      });
    } else {
      toInsert.push({
        test_id: testId,
        student_id: row.studentId,
        marks_obtained: row.marksObtained,
        remark: remarkVal,
      });
    }
  }

  const saved: Mark[] = [];

  for (const upd of toUpdate) {
    const { data: updatedRow, error: updErr } = await supabase
      .from('marks')
      .update({
        marks_obtained: upd.marks_obtained,
        remark: upd.remark,
      })
      .eq('id', upd.id)
      .select('*')
      .single();
    if (updErr || !updatedRow) {
      console.error('Supabase saveMarks update error:', updErr);
      throw new Error(updErr?.message || 'Failed to update marks');
    }
    saved.push(mapMarkRow(updatedRow as Record<string, unknown>));
  }

  if (toInsert.length > 0) {
    const { data: insertedRows, error: insErr } = await supabase
      .from('marks')
      .insert(toInsert)
      .select('*');
    if (insErr) {
      console.error('Supabase saveMarks insert error:', insErr);
      throw new Error(insErr.message || 'Failed to save new marks');
    }
    for (const r of insertedRows ?? []) {
      saved.push(mapMarkRow(r as Record<string, unknown>));
    }
  }

  return saved;
}

export async function getMarksForStudent(
  studentId: string
): Promise<StudentMarkDetail[]> {
  const [{ data: marksData, error: marksErr }, tests] = await Promise.all([
    supabase.from('marks').select('*').eq('student_id', studentId),
    getTests(),
  ]);

  if (marksErr) {
    console.error('Supabase getMarksForStudent error:', marksErr);
    throw new Error(marksErr.message || 'Failed to load student marks');
  }

  const testMap = new Map(tests.map((t) => [t.id, t]));
  const result: StudentMarkDetail[] = [];

  for (const raw of marksData ?? []) {
    const mark = mapMarkRow(raw as Record<string, unknown>);
    const test = testMap.get(mark.testId);
    if (test) {
      result.push({ ...mark, test });
    }
  }

  return result.sort((a, b) => a.test.testDate.localeCompare(b.test.testDate));
}

export async function getAllMarks(): Promise<Mark[]> {
  const { data, error } = await supabase.from('marks').select('*');
  if (error) {
    console.error('Supabase getAllMarks error:', error);
    throw new Error(error.message || 'Failed to load marks');
  }
  return (data ?? []).map((row) => mapMarkRow(row as Record<string, unknown>));
}

export function sendWhatsApp(phone: string, message: string): void {
  // Stub for version 2 WhatsApp Business API integration
  console.log(`[WhatsApp Stub] To: ${phone} | Message: ${message}`);
}

export const FEE_PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Bank',
  'Cheque',
  'Other',
] as const;

export type FeePaymentMode = (typeof FEE_PAYMENT_MODES)[number];

export type FeeStatusState = 'Paid' | 'Pending' | 'Overdue';

export interface FeeStatusRow {
  id: string;
  studentId: string;
  title: string;
  amount: number;
  dueDate: string;
  createdAt: string;
  paid: number;
  balance: number;
}

export interface FeePayment {
  id: string;
  feeId: string;
  amount: number;
  paidOn: string;
  mode: FeePaymentMode;
  note?: string;
  createdAt: string;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeFeeStatus(
  fee: Pick<FeeStatusRow, 'balance' | 'dueDate'>,
  today: string = getTodayIsoDate()
): FeeStatusState {
  if (fee.balance <= 0) return 'Paid';
  if (fee.dueDate && fee.dueDate < today) return 'Overdue';
  return 'Pending';
}

export function formatINR(amount: number): string {
  const numeric = Number.isFinite(amount) ? amount : 0;
  return `₹${numeric.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;
}

function mapFeeStatusRow(row: Record<string, unknown>): FeeStatusRow {
  return {
    id: String(row.id ?? ''),
    studentId: String(row.student_id ?? ''),
    title: String(row.title ?? ''),
    amount: Number(row.amount ?? 0),
    dueDate: String(row.due_date ?? '').slice(0, 10),
    createdAt: String(row.created_at ?? ''),
    paid: Number(row.paid ?? 0),
    balance: Number(row.balance ?? 0),
  };
}

function mapFeePaymentRow(row: Record<string, unknown>): FeePayment {
  const rawMode = String(row.mode ?? 'Other');
  const mode = (FEE_PAYMENT_MODES as readonly string[]).includes(rawMode)
    ? (rawMode as FeePaymentMode)
    : 'Other';
  return {
    id: String(row.id ?? ''),
    feeId: String(row.fee_id ?? ''),
    amount: Number(row.amount ?? 0),
    paidOn: String(row.paid_on ?? '').slice(0, 10),
    mode,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function getFeeStatuses(
  studentId?: string
): Promise<FeeStatusRow[]> {
  let query = supabase
    .from('fee_status')
    .select('id, student_id, title, amount, due_date, created_at, paid, balance')
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (studentId) {
    query = query.eq('student_id', studentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Supabase getFeeStatuses error:', error);
    throw new Error(error.message || 'Failed to load fees');
  }

  return (data ?? []).map((row) =>
    mapFeeStatusRow(row as Record<string, unknown>)
  );
}

export async function getFeePayments(feeId?: string): Promise<FeePayment[]> {
  let query = supabase
    .from('fee_payments')
    .select('id, fee_id, amount, paid_on, mode, note, created_at')
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (feeId) {
    query = query.eq('fee_id', feeId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Supabase getFeePayments error:', error);
    throw new Error(error.message || 'Failed to load fee payments');
  }

  return (data ?? []).map((row) =>
    mapFeePaymentRow(row as Record<string, unknown>)
  );
}

export async function addFees(input: {
  title: string;
  amount: number;
  dueDate: string;
  studentIds: string[];
}): Promise<void> {
  const title = input.title.trim();
  const amount = Number(input.amount);
  const dueDate = input.dueDate;

  if (!title) {
    throw new Error('Fee title is required');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Fee amount must be greater than 0');
  }
  if (!dueDate) {
    throw new Error('Due date is required');
  }
  if (input.studentIds.length === 0) {
    throw new Error('Select at least one active student');
  }

  const rows = input.studentIds.map((studentId) => ({
    student_id: studentId,
    title,
    amount,
    due_date: dueDate,
  }));

  const { error } = await supabase.from('fees').insert(rows);
  if (error) {
    console.error('Supabase addFees error:', error);
    throw new Error(error.message || 'Failed to add fee');
  }
}

export async function updateFee(
  id: string,
  data: { title: string; amount: number; dueDate: string }
): Promise<void> {
  const title = data.title.trim();
  const amount = Number(data.amount);
  const dueDate = data.dueDate;

  if (!title) {
    throw new Error('Fee title is required');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Fee amount must be greater than 0');
  }
  if (!dueDate) {
    throw new Error('Due date is required');
  }

  const { error } = await supabase
    .from('fees')
    .update({
      title,
      amount,
      due_date: dueDate,
    })
    .eq('id', id);

  if (error) {
    console.error('Supabase updateFee error:', error);
    throw new Error(error.message || 'Failed to update fee');
  }
}

export async function deleteFee(id: string): Promise<void> {
  const { error } = await supabase.from('fees').delete().eq('id', id);
  if (error) {
    console.error('Supabase deleteFee error:', error);
    throw new Error(error.message || 'Failed to delete fee');
  }
}

export async function recordFeePayment(input: {
  feeId: string;
  amount: number;
  paidOn: string;
  mode: FeePaymentMode;
  note?: string;
}): Promise<void> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }
  if (!input.paidOn) {
    throw new Error('Payment date is required');
  }
  if (!(FEE_PAYMENT_MODES as readonly string[]).includes(input.mode)) {
    throw new Error('Invalid payment mode');
  }

  const { error } = await supabase.from('fee_payments').insert({
    fee_id: input.feeId,
    amount,
    paid_on: input.paidOn,
    mode: input.mode,
    note: input.note?.trim() ? input.note.trim() : null,
  });

  if (error) {
    console.error('Supabase recordFeePayment error:', error);
    throw new Error(error.message || 'Failed to record payment');
  }
}

export type MessageLogStatus = 'sent' | 'failed';

export interface MessageLogEntry {
  id: string;
  createdAt: string;
  parentName: string;
  type: string;
  phone: string;
  status: MessageLogStatus;
  error?: string;
}

function mapMessageLogRow(row: Record<string, unknown>): MessageLogEntry {
  const rawParent = Array.isArray(row.parents)
    ? (row.parents[0] as Record<string, unknown> | undefined)
    : (row.parents as Record<string, unknown> | undefined);

  const rawStatus = String(row.status ?? '').toLowerCase();
  const status: MessageLogStatus = rawStatus === 'sent' ? 'sent' : 'failed';

  return {
    id: String(row.id ?? ''),
    createdAt: String(row.created_at ?? row.sent_at ?? ''),
    parentName: String(
      rawParent?.name ??
        rawParent?.full_name ??
        row.parent_name ??
        '—'
    ),
    type: String(row.type ?? row.message_type ?? 'notice'),
    phone: String(row.phone ?? row.to_phone ?? row.recipient ?? '—'),
    status,
    error:
      (row.error ?? row.error_message ?? row.failure_reason ?? undefined) as
        | string
        | undefined,
  };
}

export async function getMessageLogs(): Promise<MessageLogEntry[]> {
  const { data, error } = await supabase
    .from('message_log')
    .select('*, parents(name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase getMessageLogs error:', error);
    throw new Error(error.message || 'Failed to load message log');
  }

  return (data ?? []).map((row) =>
    mapMessageLogRow(row as Record<string, unknown>)
  );
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

function mapNoticeRow(row: Record<string, unknown>): Notice {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    body: String(row.body ?? row.message ?? row.content ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

export async function getNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase getNotices error:', error);
    throw new Error(error.message || 'Failed to load notices');
  }

  return (data ?? []).map((row) =>
    mapNoticeRow(row as Record<string, unknown>)
  );
}

export async function addNotice(input: {
  title: string;
  body: string;
}): Promise<Notice> {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) {
    throw new Error('Notice title is required');
  }
  if (!body) {
    throw new Error('Notice message is required');
  }

  const first = await supabase
    .from('notices')
    .insert({ title, body })
    .select('*')
    .single();
  if (!first.error && first.data) {
    return mapNoticeRow(first.data as Record<string, unknown>);
  }

  let lastError = first.error;

  if (lastError?.code === 'PGRST204') {
    const second = await supabase
      .from('notices')
      .insert({ title, message: body })
      .select('*')
      .single();
    if (!second.error && second.data) {
      return mapNoticeRow(second.data as Record<string, unknown>);
    }
    lastError = second.error;

    if (lastError?.code === 'PGRST204') {
      const third = await supabase
        .from('notices')
        .insert({ title, content: body })
        .select('*')
        .single();
      if (!third.error && third.data) {
        return mapNoticeRow(third.data as Record<string, unknown>);
      }
      lastError = third.error;
    }
  }

  console.error('Supabase addNotice error:', lastError);
  throw new Error(lastError?.message || 'Failed to save notice');
}

export async function deleteNotice(id: string): Promise<void> {
  const { error } = await supabase.from('notices').delete().eq('id', id);
  if (error) {
    console.error('Supabase deleteNotice error:', error);
    throw new Error(error.message || 'Failed to delete notice');
  }
}

export interface WhatsAppInvokeResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  lastError?: string;
  errorMessage?: string;
}

export async function extractFunctionErrorMessage(
  error: unknown,
  fallback = 'Unknown error'
): Promise<string> {
  if (!error) return fallback;
  const errObj = error as {
    context?: unknown;
    message?: unknown;
  };

  const ctx = errObj.context as Response | undefined;
  if (
    ctx &&
    ((typeof Response !== 'undefined' && ctx instanceof Response) ||
      typeof ctx.json === 'function')
  ) {
    try {
      const readable = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
      const body = (await readable.json()) as Record<string, unknown> | null;
      if (body && typeof body.error === 'string' && body.error.trim()) {
        return body.error.trim();
      }
      if (body && typeof body.message === 'string' && body.message.trim()) {
        return body.message.trim();
      }
    } catch {
      try {
        const readable = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
        const text = await readable.text();
        if (text.trim()) return text.trim();
      } catch {
        // fall back to error.message
      }
    }
  }

  if (typeof errObj.message === 'string' && errObj.message.trim()) {
    return errObj.message.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

export async function parseWhatsAppInvokeResult(
  data: unknown,
  error: unknown
): Promise<WhatsAppInvokeResult> {
  const rec = (data ?? {}) as Record<string, unknown>;
  const sent = Number(rec.sent ?? rec.sentCount ?? rec.sent_count ?? 0);
  const failed = Number(
    rec.failed ?? rec.failedCount ?? rec.failed_count ?? 0
  );
  const skipped = Number(rec.skipped ?? rec.skippedCount ?? 0);
  const lastError =
    typeof rec.last_error === 'string' && rec.last_error.trim()
      ? rec.last_error.trim()
      : undefined;

  if (error || lastError || failed > 0) {
    console.error('send-whatsapp response:', { data, error });
  }

  if (error) {
    const errorMessage = await extractFunctionErrorMessage(error);
    return {
      ok: false,
      sent,
      failed,
      skipped,
      lastError,
      errorMessage,
    };
  }

  return {
    ok: true,
    sent,
    failed,
    skipped,
    lastError,
  };
}
