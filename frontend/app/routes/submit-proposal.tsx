import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { apiUploadPaper, apiCheckTopicDuplication, apiListDepartments, apiGetSubmissionEligibility, getValidAccessToken, type ApiDepartment, type ApiSubmissionEligibility } from '../lib/api';
import { createTopicPdfFile } from '../lib/pdfGenerator';
import { ArrowLeft, AlertCircle, Sparkles, CheckCircle2, ShieldAlert, Cpu, Lock } from 'lucide-react';

const PROPOSAL_DRAFT_KEY = 'murrs_proposal_draft_v1';

export function meta() {
  return [
    { title: "Submit Project Proposal - Thesis Repository" },
    { name: "description", content: "Submit your academic project proposal for review and supervisor assignment" },
  ];
}

export default function SubmitProposal() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { tenant, tenantPath } = useTenant();
  const [tenantDepartments, setTenantDepartments] = useState<ApiDepartment[]>([]);
  const [eligibility, setEligibility] = useState<ApiSubmissionEligibility | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(true);

  useEffect(() => {
    void apiListDepartments().then(setTenantDepartments).catch(() => setTenantDepartments([]));
  }, [tenant?.slug]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setCheckingEligibility(true);
      try {
        const token = await getValidAccessToken();
        if (!token) return;
        const res = await apiGetSubmissionEligibility(token);
        if (!cancelled) setEligibility(res);
      } catch {
        if (!cancelled) setEligibility(null);
      } finally {
        if (!cancelled) setCheckingEligibility(false);
      }
    };
    if (isAuthenticated) {
      void check();
    } else {
      setCheckingEligibility(false);
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, tenant?.slug]);
  
  const [selectedFile] = useState<File | null>(null);
  const [workMode, setWorkMode] = useState<'individual' | 'group'>('individual');
  const [groupAuthorCount, setGroupAuthorCount] = useState(2);
  const [groupAuthorCountInput, setGroupAuthorCountInput] = useState('2');
  const [authors, setAuthors] = useState<{ name: string }[]>([{ name: '' }]);
  
  const [formData, setFormData] = useState({
    title: '',
    abstract: '',
    keywords: '',
    discipline: '',
  });

  const [duplicateCheck, setDuplicateCheck] = useState<{ is_duplicate: boolean; message: string; similarity_pct: number } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  useEffect(() => {
    const trimmed = formData.title.trim();
    if (trimmed.length < 5) {
      setDuplicateCheck(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const res = await apiCheckTopicDuplication(trimmed);
        setDuplicateCheck(res);
      } catch {
        // Silent catch
      } finally {
        setCheckingDuplicate(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [formData.title]);

  const disciplineOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        tenantDepartments.flatMap((d) => [d.name, ...(d.programs || [])]).filter(Boolean),
      ),
    );
    return names.length > 0 ? names : ['General Research'];
  }, [tenantDepartments]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(tenantPath('/login'));
    }
  }, [isAuthenticated, navigate, tenantPath]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROPOSAL_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.formData) setFormData((prev) => ({ ...prev, ...parsed.formData }));
      if (parsed.workMode) setWorkMode(parsed.workMode);
      if (Array.isArray(parsed.authors) && parsed.authors.length > 0) setAuthors(parsed.authors);
      if (typeof parsed.groupAuthorCount === 'number') {
        setGroupAuthorCount(parsed.groupAuthorCount);
        setGroupAuthorCountInput(String(parsed.groupAuthorCount));
      }
      setMessage('Restored your saved draft proposal.');
      setMessageType('success');
    } catch {
      // Ignore malformed draft
    }
  }, []);

  useEffect(() => {
    if (workMode === 'individual') {
      setAuthors([{ name: user?.name || '' }]);
      return;
    }
    const count = Math.max(2, groupAuthorCount);
    setAuthors((prev) => {
      const next = [...prev];
      if (next.length < count) {
        while (next.length < count) next.push({ name: '' });
      } else if (next.length > count) {
        next.splice(count);
      }
      return next;
    });
  }, [workMode, groupAuthorCount, user?.name]);

  const saveDraft = (updatedFormData = formData, updatedAuthors = authors, mode = workMode, count = groupAuthorCount) => {
    try {
      const payload = {
        formData: updatedFormData,
        authors: updatedAuthors,
        workMode: mode,
        groupAuthorCount: count,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(PROPOSAL_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  };

  const handleFormDataChange = (field: keyof typeof formData, value: string) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    saveDraft(next);
  };

  const handleWorkModeChange = (val: string) => {
    const mode = val as 'individual' | 'group';
    setWorkMode(mode);
    saveDraft(formData, authors, mode);
  };

  const handleGroupCountChange = (val: string) => {
    setGroupAuthorCountInput(val);
    const parsed = Number(val);
    const safe = Number.isFinite(parsed) ? Math.max(2, Math.min(20, Math.floor(parsed))) : 2;
    setGroupAuthorCount(safe);
    saveDraft(formData, authors, workMode, safe);
  };

  const handleAuthorNameChange = (index: number, val: string) => {
    const next = [...authors];
    next[index] = { name: val };
    setAuthors(next);
    saveDraft(formData, next);
  };

  const titleWordCount = useMemo(() => {
    return formData.title.trim().split(/\s+/).filter(Boolean).length;
  }, [formData.title]);

  const abstractWordCount = useMemo(() => {
    return formData.abstract.trim().split(/\s+/).filter(Boolean).length;
  }, [formData.abstract]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    const token = localStorage.getItem('murrs_access_token');
    if (!token) {
      setMessage('You must be signed in to submit a proposal.');
      setMessageType('error');
      return;
    }
    let fileToUpload = selectedFile;
    if (!fileToUpload) {
      fileToUpload = createTopicPdfFile({
        title: formData.title,
        abstract: formData.abstract,
        authorName: user?.name || 'Student',
        department: formData.discipline,
        discipline: formData.discipline,
        documentType: 'thesis_topic',
      });
    }
    if (!formData.title.trim()) {
      setMessage('Project title is required.');
      setMessageType('error');
      return;
    }
    if (titleWordCount > 20) {
      setMessage('Title must not exceed 20 words.');
      setMessageType('error');
      return;
    }
    if (abstractWordCount < 20 || abstractWordCount > 300) {
      setMessage('Topic Short Description / Problem Statement must be between 20 and 300 words.');
      setMessageType('error');
      return;
    }
    const tags = formData.keywords
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length < 3 || tags.length > 10) {
      setMessage('Provide between 3 and 10 keywords (comma-separated).');
      setMessageType('error');
      return;
    }
    if (!formData.discipline) {
      setMessage('Please select a discipline.');
      setMessageType('error');
      return;
    }
    if (workMode === 'group' && authors.filter((a) => a.name.trim()).length < 2) {
      setMessage('Group work requires at least 2 author names.');
      setMessageType('error');
      return;
    }

    setIsUploading(true);
    setUploadProgress(30);

    try {
      await apiUploadPaper(
        {
          title: formData.title,
          abstract: formData.abstract,
          discipline: formData.discipline,
          university: tenant?.name || user?.university || 'GIMPA',
          document_type: 'proposal',
          license: 'all-rights-reserved',
          file: fileToUpload,
          tags,
          authors: authors.filter((a) => a.name.trim()),
          work_mode: workMode,
          supervisor_id: undefined,
        },
        token,
      );

      setUploadProgress(100);
      setMessage('Thesis topic submitted successfully! Redirecting to My Thesis Submissions...');
      setMessageType('success');
      localStorage.removeItem(PROPOSAL_DRAFT_KEY);

      setTimeout(() => {
        navigate(`${tenantPath('/')}?tab=submissions`);
      }, 1600);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to submit proposal');
      setMessageType('error');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const brandShort = tenant?.short_name || 'GIMPA';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      {/* Branded Top Header Bar */}
      <header
        className="h-[60px] w-full px-8 flex items-center justify-between"
        style={{ background: 'var(--bg-header)', borderBottom: '1px solid var(--border-header)', color: 'var(--header-text, var(--text-main))' }}
      >
        <div className="flex items-center gap-3">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={brandShort} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', background: '#fff', padding: 2 }} />
          ) : (
            <div className="size-8 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: 'var(--fp-olive)', color: 'var(--fp-olive-text, #fff)' }}>
              {brandShort.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-bold text-[15px] tracking-tight">
            {brandShort} Thesis Repository
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${tenantPath('/')}?tab=submissions`)}
          className="inline-flex items-center gap-2 text-[13px] font-semibold hover:opacity-75 transition-opacity cursor-pointer"
          style={{ background: 'none', border: 'none', color: 'inherit' }}
        >
          <ArrowLeft className="size-4" />
          Back to My Thesis Submissions
        </button>
      </header>

      {/* Main Workspace */}
      <main className="mx-auto px-6 py-12 max-w-3xl">
        {!checkingEligibility && eligibility && !eligibility.can_submit_new ? (
          <div className="fp-card space-y-5 text-center py-10">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'var(--fp-sage)', color: 'var(--fp-sage-text)' }}
            >
              <Lock className="size-6" />
            </div>
            <div className="space-y-2 max-w-lg mx-auto">
              <h1 className="text-[22px] font-bold">One Active Submission At A Time</h1>
              <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
                {eligibility.message}
              </p>
              {eligibility.active_submission && (
                <div
                  className="p-4 rounded-xl text-left text-[13px] mt-3"
                  style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                >
                  <div>
                    <strong>Active Thesis:</strong> {eligibility.active_submission.title}
                  </div>
                  <div className="mt-1">
                    <strong>Current Status:</strong>{' '}
                    <span className="capitalize">
                      {eligibility.active_submission.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[12.5px] pt-2" style={{ color: 'var(--text-muted)' }}>
                Once your current thesis is completed and archived, you will automatically be unlocked to submit your next degree thesis (for example, Master&apos;s or PhD) using the same account.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={() => navigate(`${tenantPath('/')}?tab=submissions`)}>
                Go to My Thesis Submissions
              </Button>
            </div>
          </div>
        ) : (
        <>
        <div className="mb-8">
          <h1 className="text-[28px] font-bold tracking-tight mb-1">
            Submit Thesis Topic
          </h1>
          <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
            Phase 1: Submit your proposed topic title and short description for HOD approval and supervisor assignment.
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl border text-[13px] flex items-start gap-3 ${
              messageType === 'success'
                ? 'bg-[#e6eedc] border-[#c9d8b6] text-[#3b7a57] font-semibold'
                : 'bg-[#fbeae8] border-[#c93b2b]/30 text-[#c93b2b] font-semibold'
            }`}
          >
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="fp-card space-y-6">
            <div>
              <h3 className="text-[17px] font-bold text-[#1a1d1a] mb-1">Thesis Topic Details</h3>
              <p className="text-[13px] text-[#6e746b] m-0">
                Fill out your proposed topic details for departmental review.
              </p>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="title">Thesis Topic Title *</Label>
                <span
                  className={`text-[12px] font-mono ${
                    titleWordCount > 20 ? 'text-[#c93b2b] font-bold' : 'text-[#6e746b]'
                  }`}
                >
                  {titleWordCount} / 20 words
                </span>
              </div>
              <Input
                id="title"
                placeholder="Enter your proposed thesis topic title"
                value={formData.title}
                onChange={(e) => handleFormDataChange('title', e.target.value)}
                required
              />
              {checkingDuplicate && (
                <p className="text-[12px] text-[#6e746b] flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-[#3b7a57]" /> Checking topic uniqueness against repository...
                </p>
              )}
              {duplicateCheck && (
                <div
                  className={`p-3.5 rounded-lg border text-[12px] flex items-start gap-2.5 ${
                    duplicateCheck.is_duplicate
                      ? 'bg-[#fbeae8] border-[#c93b2b]/30 text-[#c93b2b]'
                      : 'bg-[#e6eedc]/60 border-[#c9d8b6] text-[#3b7a57]'
                  }`}
                >
                  {duplicateCheck.is_duplicate ? (
                    <ShieldAlert className="size-4 shrink-0 mt-0.5 text-[#c93b2b]" />
                  ) : (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-[#3b7a57]" />
                  )}
                  <div>
                    <p className="font-bold m-0">
                      {duplicateCheck.is_duplicate
                        ? 'Duplicate Topic Alert — Cannot Submit'
                        : 'Unique Research Topic'}
                    </p>
                    <p className="mt-0.5 m-0">{duplicateCheck.message}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Intelligent Supervisor Allocation Notice */}
            <div className="p-4 rounded-xl border border-[#eaece4] bg-[#ffffff] text-[12px] flex items-start gap-3">
              <Cpu className="size-4 text-[#5a6552] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-[#1a1d1a] m-0">
                  Intelligent Supervisor Matching & Quota Balancing
                </p>
                <p className="text-[#6e746b] leading-relaxed m-0">
                  Based on your topic keywords, the system automatically recommends a project supervisor specialized in your domain while respecting departmental workload quotas.
                </p>
              </div>
            </div>

            {/* Short Description */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="abstract">Topic Short Description / Problem Statement *</Label>
                <span
                  className={`text-[12px] font-mono ${
                    abstractWordCount < 20 || abstractWordCount > 300
                      ? 'text-[#c93b2b] font-bold'
                      : 'text-[#3b7a57] font-bold'
                  }`}
                >
                  {abstractWordCount} words (20–300 words)
                </span>
              </div>
              <Textarea
                id="abstract"
                placeholder="Provide a short description of your proposed research topic, key problem statement, and expected outcomes..."
                rows={5}
                value={formData.abstract}
                onChange={(e) => handleFormDataChange('abstract', e.target.value)}
                required
              />
            </div>

            {/* Keywords */}
            <div className="space-y-1.5">
              <Label htmlFor="keywords">Keywords *</Label>
              <Input
                id="keywords"
                placeholder="e.g. machine learning, finance, cybersecurity (3–10 tags, comma-separated)"
                value={formData.keywords}
                onChange={(e) => handleFormDataChange('keywords', e.target.value)}
                required
              />
              <p className="text-[12px] text-[#6e746b] m-0">
                Enter 3 to 10 tags separated by commas.
              </p>
            </div>

            {/* Discipline & Work Mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="discipline">Discipline *</Label>
                <Select
                  value={formData.discipline}
                  onValueChange={(val) => handleFormDataChange('discipline', val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select discipline" />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplineOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="workMode">Work Type *</Label>
                <Select value={workMode} onValueChange={handleWorkModeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select work type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual Project</SelectItem>
                    <SelectItem value="group">Group Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {workMode === 'group' && (
              <div className="space-y-4 pt-4 border-t border-[#eaece4]">
                <div className="space-y-1.5">
                  <Label htmlFor="group-count">Number of Authors *</Label>
                  <Input
                    id="group-count"
                    type="number"
                    min={2}
                    max={20}
                    value={groupAuthorCountInput}
                    onChange={(e) => handleGroupCountChange(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <Label>Author Names</Label>
                  {authors.map((author, index) => (
                    <div key={index} className="flex gap-3 items-center">
                      <span className="text-[12px] text-[#6e746b] w-20">Author {index + 1}:</span>
                      <Input
                        placeholder="Full name"
                        value={author.name}
                        onChange={(e) => handleAuthorNameChange(index, e.target.value)}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form Actions (FinPlanner Image 10 style) */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isUploading} className="px-6 h-11 font-bold">
                {isUploading ? 'Submitting Topic...' : 'Submit Thesis Topic'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="px-6 h-11"
                onClick={() => {
                  saveDraft();
                  setMessage('Draft saved locally.');
                  setMessageType('success');
                }}
                disabled={isUploading}
              >
                Save Draft
              </Button>
            </div>
          </div>
        </form>
        </>
        )}
      </main>
    </div>
  );
}
