"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PusherSection } from "@/components/app/pusher-section";
import { FilesSection } from "@/components/app/files-section";
import { SettingsDialog } from "@/components/app/settings-dialog";
import {
  Github,
  KeyRound,
  Loader2,
  Rocket,
  FolderGit2,
  GitCommit,
  Link2,
  RefreshCw,
  Settings2,
} from "lucide-react";

interface CommitInfo {
  sha: string;
  message: string;
  url: string;
  date: string;
}

interface Status {
  tokenValid: boolean;
  login: string | null;
  tokenMasked: string;
  tokenSource: "custom" | "env" | "none";
  repo: string;
  branch: string;
  repoFound: boolean;
  isPrivate: boolean | null;
  empty: boolean;
  error: string | null;
  commits: CommitInfo[];
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [signal, setSignal] = useState(0);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const bump = useCallback(() => setSignal((s) => s + 1), []);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header sticky */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-3" aria-label="Retour en haut">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Github className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <span className="font-bold">bgh pusher</span>
          </a>
          <nav aria-label="Navigation principale" className="hidden sm:flex items-center gap-1">
            <a
              href="#pusher"
              className="px-3 py-2 text-sm text-zinc-400 hover:text-emerald-400 rounded-md hover:bg-zinc-900 transition-colors"
            >
              Pusher
            </a>
            <a
              href="#fichiers"
              className="px-3 py-2 text-sm text-zinc-400 hover:text-emerald-400 rounded-md hover:bg-zinc-900 transition-colors"
            >
              Fichiers
            </a>
          </nav>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ouvrir les paramètres du token"
            className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
          >
            <Settings2 className="h-4 w-4 mr-1" aria-hidden="true" />
            <span className="hidden sm:inline">Token</span>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero / landing */}
        <section
          aria-label="Introduction"
          className="relative overflow-hidden border-b border-zinc-800"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_60%)]"
          />
          <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-20 flex flex-col items-center text-center gap-6">
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
            >
              pont IA → GitHub
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight max-w-3xl">
              Pousse sur GitHub.{" "}
              <span className="text-emerald-500">Sans terminal.</span>
            </h1>
            <p className="text-zinc-400 max-w-2xl text-sm sm:text-base">
              Le pont entre tes IA et ton dépôt : colle du code, dépose des fichiers ou un zip
              entier, édite ou supprime — chaque action devient un commit propre, poussé
              automatiquement.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-500 h-12 text-base font-semibold"
                onClick={() => document.getElementById("pusher")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Rocket className="h-5 w-5 mr-2" aria-hidden="true" />
                Pousser des fichiers
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 h-12 text-base"
                onClick={() => document.getElementById("fichiers")?.scrollIntoView({ behavior: "smooth" })}
              >
                <FolderGit2 className="h-5 w-5 mr-2" aria-hidden="true" />
                Gérer le dépôt
              </Button>
            </div>

            {/* Statut rapide */}
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {statusLoading ? (
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
                  Vérification…
                </Badge>
              ) : status?.tokenValid ? (
                <>
                  <Badge
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 cursor-pointer hover:border-emerald-500/50"
                    onClick={() => setSettingsOpen(true)}
                    title="Cliquer pour changer de token"
                  >
                    <KeyRound className="h-3 w-3 mr-1 text-emerald-500" aria-hidden="true" />
                    {status.repo} · {status.branch}
                    {status.isPrivate ? " · privé" : " · public"}
                  </Badge>
                  {status.tokenSource === "custom" && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                      token personnalisé · {status.tokenMasked}
                    </Badge>
                  )}
                </>
              ) : (
                <Badge
                  variant="destructive"
                  className="cursor-pointer"
                  onClick={() => setSettingsOpen(true)}
                  title="Cliquer pour configurer un token"
                >
                  <KeyRound className="h-3 w-3 mr-1" aria-hidden="true" />
                  {status?.error ?? "Token invalide — cliquer pour configurer"}
                </Badge>
              )}
            </div>
          </div>
        </section>

        {/* Section Pusher */}
        <section id="pusher" aria-label="Pousser des fichiers" className="scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 py-12">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-base font-bold">
                1
              </span>
              Pousse tes fichiers
            </h2>
            <PusherSection onMutate={bump} />
          </div>
        </section>

        {/* Section Fichiers */}
        <section
          id="fichiers"
          aria-label="Gérer les fichiers du dépôt"
          className="border-t border-zinc-800 bg-zinc-900/30 scroll-mt-20"
        >
          <div className="max-w-6xl mx-auto px-4 py-12">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-base font-bold">
                2
              </span>
              Gère les fichiers du dépôt
            </h2>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <FilesSection refreshSignal={signal} onMutate={bump} />
              </div>

              {/* Derniers commits */}
              <Card className="bg-zinc-900 border-zinc-800 self-start">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <GitCommit className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                      Derniers commits
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshStatus}
                      aria-label="Rafraîchir les commits"
                      className="h-8 w-8 p-0 text-zinc-500 hover:text-emerald-400"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                  <CardDescription className="text-zinc-400">
                    Historique en direct depuis GitHub.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {status && status.commits.length > 0 ? (
                    <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                      {status.commits.map((c) => (
                        <li
                          key={c.sha}
                          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-emerald-400">{c.sha}</span>
                            <span className="text-xs text-zinc-500">{formatDate(c.date)}</span>
                          </div>
                          <p className="text-sm mt-1 truncate" title={c.message}>
                            {c.message}
                          </p>
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-emerald-400 mt-1"
                          >
                            <Link2 className="h-3 w-3" aria-hidden="true" />
                            voir sur GitHub
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Aucun commit pour l'instant — le premier push apparaîtra ici.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer sticky */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">
            bgh pusher — ton pont entre les IA et GitHub
          </span>
          <a
            href={`https://github.com/${status?.repo ?? "DimalaxYT/bgh"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-emerald-400"
          >
            dépôt sur GitHub
          </a>
        </div>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => {
          refreshStatus();
          bump();
        }}
      />
    </div>
  );
}
