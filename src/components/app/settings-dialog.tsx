"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  ChevronDown,
  GitBranch,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";

interface SettingsState {
  hasToken: boolean;
  tokenMasked: string;
  tokenSource: "custom" | "env" | "none";
  repo: string;
  branch: string;
}

interface DiscoveredRepo {
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  pushedAt: string | null;
  fork: boolean;
  writable: boolean;
  score: number;
  reasons: string[];
}

interface TokenAnalysis {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  scanned: number;
  repos: DiscoveredRepo[];
  suggestion: { repo: string; branch: string; reason: string } | null;
}

interface BranchInfo {
  name: string;
  isDefault: boolean;
}

const STEPS = [
  "Connexion à api.github.com",
  "Validation du token",
  "Identification du compte",
  "Scan des dépôts accessibles",
  "Calcul du dépôt le plus probable",
];

const MAX_DISPLAYED = 20;

function timeAgo(iso: string | null): string {
  if (!iso) return "jamais poussé";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "poussé à l'instant";
    if (s < 3600) return `poussé il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `poussé il y a ${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400);
    if (d < 31) return `poussé il y a ${d} j`;
    return `poussé le ${new Date(iso).toLocaleDateString("fr-FR")}`;
  } catch {
    return "";
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [current, setCurrent] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Agent de détection
  const [token, setToken] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");

  // Réglage manuel
  const [manualOpen, setManualOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data: SettingsState = await res.json();
      setCurrent(data);
      setRepo(data.repo);
      setBranch(data.branch);
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setToken("");
      setAnalysis(null);
      setAgentError(null);
      setStepIdx(-1);
      setSelectedRepo("");
      setBranches([]);
      setSelectedBranch("");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveWith = async (t: string, r: string, b: string) => {
    if (!t) {
      toast({
        title: "Token requis",
        description: "Colle le token dans le champ prévu.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t, repo: r, branch: b }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: "Configuration enregistrée",
          description: `${data.repo} · branche ${data.branch} (token validé).`,
        });
        setToken("");
        onSaved();
        onOpenChange(false);
      } else {
        toast({ title: "Configuration refusée", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const runAnalysis = async () => {
    const t = token.trim();
    if (!t) {
      toast({
        title: "Colle d'abord un token",
        description: "L'agent en a besoin pour découvrir le dépôt tout seul.",
        variant: "destructive",
      });
      return;
    }
    setAnalysis(null);
    setAgentError(null);
    setSelectedRepo("");
    setBranches([]);
    setSelectedBranch("");
    setAnalyzing(true);
    setStepIdx(0);
    const timer = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)),
      450
    );
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAgentError(data.error ?? "Analyse impossible.");
      } else {
        setAnalysis(data as TokenAnalysis);
        const sug = (data as TokenAnalysis).suggestion;
        if (sug) void selectRepo(sug.repo, t);
      }
    } catch {
      setAgentError("Erreur réseau pendant l'analyse.");
    } finally {
      clearInterval(timer);
      setStepIdx(STEPS.length);
      setAnalyzing(false);
    }
  };

  const selectRepo = async (fullName: string, tokenOverride?: string) => {
    setSelectedRepo(fullName);
    setBranches([]);
    setSelectedBranch("");
    setBranchesLoading(true);
    try {
      const t = (tokenOverride ?? token).trim();
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: fullName, token: t || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setBranches(data.branches);
        const def =
          data.branches.find((b: BranchInfo) => b.isDefault)?.name ??
          data.branches[0]?.name ??
          "";
        setSelectedBranch(def);
      } else {
        toast({ title: "Branches indisponibles", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setBranchesLoading(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "Retour au token d'environnement" });
        setToken("");
        setAnalysis(null);
        load();
        onSaved();
      } else {
        toast({ title: "Échec du reset", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const displayed = analysis ? analysis.repos.slice(0, MAX_DISPLAYED) : [];
  const selectedMeta = analysis?.repos.find((r) => r.fullName === selectedRepo) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            Token & dépôt
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Colle un token : l&apos;agent trouve tout seul le compte, le dépôt et la branche.
            Aucune API d&apos;IA externe — la détection est calculée ici. Le token n&apos;est
            jamais renvoyé en clair.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Chargement…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Config actuelle */}
            <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    current?.tokenSource === "custom"
                      ? "text-amber-400 border-amber-400/40"
                      : "text-emerald-400 border-emerald-400/40"
                  }
                >
                  {current?.tokenSource === "custom"
                    ? "token personnalisé"
                    : current?.tokenSource === "env"
                      ? "token d'environnement"
                      : "aucun token"}
                </Badge>
                {current?.hasToken && (
                  <span className="font-mono text-xs text-zinc-400">{current.tokenMasked}</span>
                )}
                {current?.hasToken && (
                  <span className="text-xs text-zinc-500">
                    → {current.repo} · {current.branch}
                  </span>
                )}
              </div>
            </div>

            {/* Champ token */}
            <div>
              <Label htmlFor="settings-token" className="text-zinc-300">
                Token GitHub (fine-grained PAT)
              </Label>
              <Input
                id="settings-token"
                type="password"
                placeholder="github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                autoComplete="off"
              />
            </div>

            {/* Bouton d'analyse */}
            <Button
              onClick={runAnalysis}
              disabled={analyzing || !token.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 w-full h-11 text-base font-semibold"
            >
              {analyzing ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-5 w-5 mr-2" aria-hidden="true" />
              )}
              {analyzing ? "L'agent analyse le token…" : "Trouver le dépôt et la branche"}
            </Button>

            {/* Étapes de l'analyse */}
            {(analyzing || (analysis && stepIdx >= 0)) && (
              <ol className="flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                {STEPS.map((label, i) => {
                  const done = stepIdx > i;
                  const active = stepIdx === i && analyzing;
                  return (
                    <li key={label} className="flex items-center gap-2 text-sm">
                      {done ? (
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
                      ) : active ? (
                        <Loader2
                          className="h-4 w-4 text-emerald-400 animate-spin shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className="h-4 w-4 rounded-full border border-zinc-700 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className={done || active ? "text-zinc-300" : "text-zinc-600"}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {agentError && (
              <p className="text-sm text-red-400 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
                {agentError}
              </p>
            )}

            {/* Résultats de l'agent */}
            {analysis && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                  {analysis.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={analysis.avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-full border border-zinc-700"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {analysis.name ?? analysis.login}
                    </p>
                    <p className="text-xs text-zinc-500">
                      @{analysis.login} · {analysis.scanned} dépôt(s) accessible(s)
                    </p>
                  </div>
                </div>

                {analysis.suggestion && (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      Cible détectée :{" "}
                      <b className="font-mono">{analysis.suggestion.repo}</b> · branche{" "}
                      <b className="font-mono">{analysis.suggestion.branch}</b> —{" "}
                      {analysis.suggestion.reason}.
                    </span>
                  </div>
                )}

                {analysis.repos.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Aucun dépôt accessible trouvé avec ce token. Vérifie que la portée du token
                    inclut les dépôts voulus (accès « All repositories » ou sélection).
                  </p>
                ) : (
                  <>
                    <div
                      className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1"
                      role="radiogroup"
                      aria-label="Dépôts détectés"
                    >
                      {displayed.map((r) => {
                        const selected = r.fullName === selectedRepo;
                        return (
                          <button
                            key={r.fullName}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => selectRepo(r.fullName)}
                            className={`text-left rounded-md border px-3 py-2 transition-colors ${
                              selected
                                ? "border-emerald-500/70 bg-emerald-500/10"
                                : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm truncate">{r.fullName}</span>
                              {analysis.suggestion?.repo === r.fullName && (
                                <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                                  recommandé
                                </Badge>
                              )}
                              {r.isPrivate && (
                                <Badge
                                  variant="outline"
                                  className="border-zinc-700 text-zinc-400 text-[10px] px-1.5 py-0"
                                >
                                  <Lock className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
                                  privé
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  r.writable
                                    ? "border-emerald-500/40 text-emerald-400"
                                    : "border-amber-500/40 text-amber-400"
                                }`}
                              >
                                {r.writable ? "écriture" : "lecture seule"}
                              </Badge>
                              {r.language && (
                                <Badge
                                  variant="outline"
                                  className="border-zinc-700 text-zinc-500 text-[10px] px-1.5 py-0"
                                >
                                  {r.language}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {timeAgo(r.pushedAt)} · branche par défaut :{" "}
                              <span className="font-mono">{r.defaultBranch}</span>
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {analysis.repos.length > MAX_DISPLAYED && (
                      <p className="text-xs text-zinc-500">
                        + {analysis.repos.length - MAX_DISPLAYED} autres dépôts non affichés
                        (les moins pertinents).
                      </p>
                    )}
                  </>
                )}

                {/* Choix de branche */}
                {selectedRepo && (
                  <div>
                    <Label htmlFor="settings-branch-select" className="text-zinc-300">
                      Branche cible
                    </Label>
                    {branchesLoading ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-400 mt-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Lecture des branches…
                      </div>
                    ) : branches.length > 0 ? (
                      <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                        <SelectTrigger
                          id="settings-branch-select"
                          className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                        >
                          <GitBranch className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                          <SelectValue placeholder="Choisir une branche" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {branches.map((b) => (
                            <SelectItem key={b.name} value={b.name}>
                              {b.name}
                              {b.isDefault ? " (par défaut)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {selectedMeta && !selectedMeta.writable && (
                      <p className="text-xs text-amber-400 mt-1.5">
                        Ce dépôt est en lecture seule avec ce token : les pushes échoueront.
                        Choisis un autre dépôt ou mets à jour la portée du token.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={() => saveWith(token.trim(), selectedRepo, selectedBranch)}
                  disabled={!selectedRepo || !selectedBranch || saving}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" aria-hidden="true" />
                  )}
                  Utiliser cette configuration
                </Button>
              </div>
            )}

            {/* Réglage manuel (repli) */}
            <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 w-fit">
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Réglage manuel (dépôt + branche à la main)
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${manualOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="settings-repo" className="text-zinc-300">
                      Dépôt (propriétaire/nom)
                    </Label>
                    <Input
                      id="settings-repo"
                      placeholder="DimalaxYT/bgh"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settings-branch" className="text-zinc-300">
                      Branche
                    </Label>
                    <Input
                      id="settings-branch"
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => saveWith(token.trim(), repo.trim(), branch.trim())}
                  disabled={saving || !token.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 mt-3"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" aria-hidden="true" />
                  )}
                  Valider et enregistrer
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={reset}
            disabled={saving || loading}
            className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          >
            <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" />
            Retour à l&apos;env
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
