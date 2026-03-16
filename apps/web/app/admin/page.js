"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Database,
  FileStack,
  LoaderCircle,
  LogOut,
  PencilLine,
  Power,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud
} from "lucide-react";
import {
  activateChart,
  deleteChartPackage,
  fetchAdminMe,
  fetchCharts,
  updateChartAndActivate,
  uploadChart
} from "../../lib/api";
import { clearAdminToken, getAdminToken } from "../../lib/auth";

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [charts, setCharts] = useState([]);

  const [busyChartId, setBusyChartId] = useState("");
  const [editorChartId, setEditorChartId] = useState("");
  const [editorCsv, setEditorCsv] = useState("");
  const [editorPerKm, setEditorPerKm] = useState("");

  async function loadCharts(authToken) {
    try {
      const data = await fetchCharts(authToken);
      setCharts(data.charts || []);
    } catch (loadError) {
      if (loadError.status === 401 || loadError.status === 403) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setCharts([]);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const currentToken = getAdminToken();

      if (!currentToken) {
        router.replace("/admin/login");
        return;
      }

      try {
        const me = await fetchAdminMe(currentToken);

        if (!mounted) {
          return;
        }

        setToken(currentToken);
        setAdminEmail(me.admin?.email || "admin");
        await loadCharts(currentToken);
      } catch {
        clearAdminToken();
        if (mounted) {
          router.replace("/admin/login");
        }
      } finally {
        if (mounted) {
          setAuthChecking(false);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [router]);

  const selectedFileSummary = useMemo(() => {
    if (!files.length) {
      return "No files selected";
    }
    if (files.length === 1) {
      return files[0].name;
    }
    return `${files.length} files selected`;
  }, [files]);

  async function onSubmit(event) {
    event.preventDefault();

    if (!files.length) {
      setError("Please select at least one PDF.");
      return;
    }

    if (!token) {
      setError("Session expired. Please login again.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const formData = new FormData();

      for (const file of files) {
        formData.append("charts", file);
      }

      const data = await uploadChart(formData, token);
      setMessage(`${data.message} Synced ${data.synced.routes} routes and ${data.synced.stations} stations.`);
      setFiles([]);
      await loadCharts(token);
    } catch (uploadError) {
      if (uploadError.status === 401 || uploadError.status === 403) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setError(uploadError.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onActivateDataset(chartId, { force = false } = {}) {
    if (!token || !chartId) {
      return;
    }

    setBusyChartId(chartId);
    setMessage("");
    setError("");

    try {
      const data = await activateChart(chartId, token, { force });
      setMessage(data.message || "Dataset activated.");
      await loadCharts(token);
    } catch (actionError) {
      if (actionError.status === 401 || actionError.status === 403) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setError(actionError.message || "Could not activate dataset.");
    } finally {
      setBusyChartId("");
    }
  }

  async function onUpdateAndActivate(chartId) {
    if (!token || !chartId) {
      return;
    }

    const hasCsv = editorCsv.trim().length > 0;
    const hasPerKm = editorPerKm !== "" && Number(editorPerKm) > 0;

    if (!hasCsv && !hasPerKm) {
      setError("Add at least one CSV row or per-km value before update.");
      return;
    }

    setBusyChartId(chartId);
    setMessage("");
    setError("");

    try {
      const payload = {
        manualCsv: editorCsv,
        perKmBdt: hasPerKm ? Number(editorPerKm) : undefined
      };

      const data = await updateChartAndActivate(chartId, payload, token);
      setMessage(data.message || "Dataset updated and activated.");
      setEditorChartId("");
      setEditorCsv("");
      setEditorPerKm("");
      await loadCharts(token);
    } catch (actionError) {
      if (actionError.status === 401 || actionError.status === 403) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setError(actionError.message || "Could not update dataset.");
    } finally {
      setBusyChartId("");
    }
  }

  async function onDeleteDataset(chart) {
    if (!token || !chart?._id) {
      return;
    }

    const packageTime = chart.createdAt ? new Date(chart.createdAt).toLocaleString() : "unknown time";
    const fileCount = chart.sourceCount ?? chart.sourceFiles?.length ?? 1;
    const confirmed = window.confirm(
      `Delete package uploaded on ${packageTime} with ${fileCount} PDF(s)? This will remove all files in this package together.`
    );

    if (!confirmed) {
      return;
    }

    setBusyChartId(chart._id);
    setMessage("");
    setError("");

    try {
      const data = await deleteChartPackage(chart._id, token);
      setMessage(
        data.reactivated
          ? `${data.message} Auto-activated fallback dataset: ${data.reactivated.fileName}.`
          : data.message || "Dataset package deleted."
      );

      if (editorChartId === chart._id) {
        setEditorChartId("");
        setEditorCsv("");
        setEditorPerKm("");
      }

      await loadCharts(token);
    } catch (actionError) {
      if (actionError.status === 401 || actionError.status === 403) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }

      setError(actionError.message || "Could not delete dataset package.");
    } finally {
      setBusyChartId("");
    }
  }
  function openEditor(chart) {
    setEditorChartId(chart._id);
    setEditorCsv("");
    setEditorPerKm(chart?.summary?.perKmBdt ? String(chart.summary.perKmBdt) : "");
    setMessage("");
    setError("");
  }

  function onLogout() {
    clearAdminToken();
    router.replace("/admin/login");
  }

  if (authChecking) {
    return (
      <div className="panel">
        <h2>Preparing Admin Console</h2>
        <p className="state-text">Checking secure session...</p>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <section className="panel panel-admin-main">
        <div className="admin-head">
          <div>
            <span className="badge badge-soft">
              <ShieldCheck size={14} />
              <span>Authenticated Admin Session</span>
            </span>
            <h1>Fare Chart Control Center</h1>
            <p>Signed in as {adminEmail}. Each upload is stored as one package (date-time stamped). Deleting a package removes all PDFs in that upload together.</p>
          </div>
          <button type="button" className="button button-muted" onClick={onLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="upload-form">
          <div className="field">
            <label htmlFor="charts" className="field-title">
              <UploadCloud size={14} />
              <span>Government Fare Chart PDFs</span>
            </label>
            <input
              id="charts"
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <small className="state-text">{selectedFileSummary}</small>
          </div>

          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />}
            <span>{loading ? "Merging and Publishing..." : "Publish Merged Dataset"}</span>
          </button>
        </form>

        {message ? <p className="state-text state-ok">{message}</p> : null}
        {error ? <p className="state-text state-error">{error}</p> : null}
      </section>

      <aside className="panel panel-admin-side">
        <h2>Recent Datasets</h2>
        {charts.length === 0 ? (
          <p className="state-text">No uploaded datasets yet.</p>
        ) : (
          <div className="dataset-list">
            {charts.map((chart) => {
              const hasParsedData = (chart.summary?.routeCount || 0) > 0 || (chart.summary?.perKmBdt || 0) > 0;
              const isBusy = busyChartId === chart._id;
              const isEditing = editorChartId === chart._id;

              return (
                <article key={chart._id} className="dataset-item">
                  <div className="dataset-head">
                    <h3>{chart.fileName}</h3>
                    <span className={`chip ${chart.isActive ? "chip-live" : "chip-idle"}`}>
                      {chart.isActive ? "Live" : "Inactive"}
                    </span>
                  </div>

                  <div className="dataset-meta">
                    <span>
                      <Clock3 size={13} />
                      <em>{new Date(chart.createdAt).toLocaleString()}</em>
                    </span>
                    <span>
                      <FileStack size={13} />
                      <em>{chart.sourceCount ?? 1} PDFs</em>
                    </span>
                    <span>
                      <Database size={13} />
                      <em>{chart.summary?.routeCount ?? 0} routes</em>
                    </span>
                  </div>

                  {chart.sourceFiles?.length ? (
                    <p className="state-text">
                      Sources: {chart.sourceFiles.slice(0, 3).join(", ")}
                      {chart.sourceFiles.length > 3 ? " ..." : ""}
                    </p>
                  ) : null}

                  {chart.parserWarnings?.length ? (
                    <p className="state-text state-warn">Warning: {chart.parserWarnings[0]}</p>
                  ) : null}

                  <div className="dataset-actions">
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => onActivateDataset(chart._id)}
                      disabled={isBusy}
                    >
                      {isBusy ? <LoaderCircle size={14} className="spin" /> : <Power size={14} />}
                      <span>Activate</span>
                    </button>

                    {!hasParsedData ? (
                      <button
                        type="button"
                        className="button button-small button-warn"
                        onClick={() => onActivateDataset(chart._id, { force: true })}
                        disabled={isBusy}
                      >
                        <ShieldAlert size={14} />
                        <span>Force Activate</span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="button button-small button-outline"
                      onClick={() => openEditor(chart)}
                      disabled={isBusy}
                    >
                      <PencilLine size={14} />
                      <span>Add/Update + Activate</span>
                    </button>

                    <button
                      type="button"
                      className="button button-small button-danger"
                      onClick={() => onDeleteDataset(chart)}
                      disabled={isBusy}
                    >
                      <Trash2 size={14} />
                      <span>Delete Package</span>
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="inline-editor">
                      <div className="field">
                        <label className="field-title" htmlFor={`perkm-${chart._id}`}>
                          <CheckCircle2 size={14} />
                          <span>Per-KM (optional)</span>
                        </label>
                        <input
                          id={`perkm-${chart._id}`}
                          type="number"
                          min="0"
                          step="0.1"
                          value={editorPerKm}
                          onChange={(e) => setEditorPerKm(e.target.value)}
                          placeholder="Example: 2.5"
                        />
                      </div>

                      <div className="field">
                        <label className="field-title" htmlFor={`csv-${chart._id}`}>
                          <PencilLine size={14} />
                          <span>CSV routes (optional)</span>
                        </label>
                        <textarea
                          id={`csv-${chart._id}`}
                          rows={5}
                          value={editorCsv}
                          onChange={(e) => setEditorCsv(e.target.value)}
                          placeholder="Origin,Destination,Fare,DistanceKm"
                        />
                      </div>

                      <div className="dataset-actions">
                        <button
                          type="button"
                          className="button button-small button-primary"
                          onClick={() => onUpdateAndActivate(chart._id)}
                          disabled={isBusy}
                        >
                          {isBusy ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />}
                          <span>Save + Activate</span>
                        </button>
                        <button
                          type="button"
                          className="button button-small button-outline"
                          onClick={() => {
                            setEditorChartId("");
                            setEditorCsv("");
                            setEditorPerKm("");
                          }}
                          disabled={isBusy}
                        >
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}






