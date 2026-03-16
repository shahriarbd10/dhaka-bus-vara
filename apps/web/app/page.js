"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Gauge,
  LoaderCircle,
  MapPinned,
  Route
} from "lucide-react";
import { calculateFare, fetchRuleInfo, fetchStations } from "../lib/api";

export default function HomePage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [ruleInfo, setRuleInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const [ruleData, stationsData] = await Promise.all([
          fetchRuleInfo().catch(() => null),
          fetchStations("", { limit: 5000 }).catch(() => ({ stations: [] }))
        ]);

        if (!mounted) {
          return;
        }

        setRuleInfo(ruleData);
        setStations(stationsData?.stations || []);
      } finally {
        if (mounted) {
          setStationsLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      mounted = false;
    };
  }, []);

  const latestSummary = useMemo(() => ruleInfo?.chart?.summary || null, [ruleInfo]);
  const canSubmit = !stationsLoading && stations.length > 0 && !loading;

  async function onSubmit(event) {
    event.preventDefault();

    if (!origin || !destination) {
      setMessage("Please select both origin and destination.");
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const data = await calculateFare({
        origin,
        destination,
        distanceKm: distanceKm ? Number(distanceKm) : undefined
      });
      setResult(data.result);
    } catch (error) {
      setMessage(error.message || "Could not calculate fare right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="home-layout">
      <section className="panel panel-hero">
        <div className="hero-top">
          <span className="badge badge-soft">
            <Gauge size={14} />
            <span>Live Fare Intelligence</span>
          </span>
          <h1>Find Accurate Dhaka Bus Fares in Seconds</h1>
          <p>
            Choose stations from verified synced data. Fare is calculated from government chart routes, with automatic per-km fallback when needed.
          </p>
        </div>

        <div className="metric-row">
          <article className="metric-card">
            <span className="metric-icon">
              <MapPinned size={17} />
            </span>
            <div>
              <strong>{stationsLoading ? "..." : stations.length}</strong>
              <small>Available Stations</small>
            </div>
          </article>
          <article className="metric-card">
            <span className="metric-icon">
              <Route size={17} />
            </span>
            <div>
              <strong>{latestSummary?.routeCount ?? 0}</strong>
              <small>Synced Routes</small>
            </div>
          </article>
          <article className="metric-card">
            <span className="metric-icon">
              <CircleDollarSign size={17} />
            </span>
            <div>
              <strong>{ruleInfo?.rule?.perKmBdt ?? latestSummary?.perKmBdt ?? "N/A"}</strong>
              <small>Per KM (BDT)</small>
            </div>
          </article>
        </div>

        <form className="fare-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="origin" className="field-title">
              <MapPinned size={14} />
              <span>Origin Station</span>
            </label>
            <select
              id="origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              required
              disabled={stationsLoading || stations.length === 0}
            >
              <option value="">Select origin station</option>
              {stations.map((station) => (
                <option key={`origin-${station._id}`} value={station.name}>
                  {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="destination" className="field-title">
              <Route size={14} />
              <span>Destination Station</span>
            </label>
            <select
              id="destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
              disabled={stationsLoading || stations.length === 0}
            >
              <option value="">Select destination station</option>
              {stations.map((station) => (
                <option key={`destination-${station._id}`} value={station.name}>
                  {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="distanceKm" className="field-title">
              <Calculator size={14} />
              <span>Distance in KM (optional)</span>
            </label>
            <input
              id="distanceKm"
              type="number"
              min="0"
              step="0.1"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="Example: 12.5"
            />
          </div>

          <button className="button button-primary" type="submit" disabled={!canSubmit}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <CircleDollarSign size={16} />}
            <span>{loading ? "Calculating Fare..." : "Calculate Fare"}</span>
          </button>
        </form>

        {stationsLoading ? <p className="state-text">Loading station network...</p> : null}
        {!stationsLoading && stations.length === 0 ? (
          <p className="state-text">No stations synced yet. Admin needs to upload a valid chart.</p>
        ) : null}
        {message ? <p className="state-text state-error">{message}</p> : null}

        {result ? (
          <div className={`result-panel ${result.status === "ok" ? "result-ok" : "result-warn"}`}>
            <div className="result-head">
              {result.status === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <h3>{result.status === "ok" ? "Fare Calculated" : "Manual Distance May Be Needed"}</h3>
            </div>

            {result.status === "ok" ? (
              <>
                <p className="fare-price">BDT {result.fareBdt}</p>
                <p className="state-text">
                  {result.origin} to {result.destination}
                </p>
                <p className="state-text">
                  Basis: {result.basis === "chart" ? "Direct chart fare" : "Per-km estimate"}
                  {result.distanceKm ? ` | Distance: ${result.distanceKm} km` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="state-text">{result.message}</p>
                {result.perKmBdt ? <p className="state-text">Current per-km rule: {result.perKmBdt} BDT / km</p> : null}
              </>
            )}
          </div>
        ) : null}
      </section>

      <aside className="panel panel-side">
        <h2>Dataset Status</h2>
        {ruleInfo?.chart ? (
          <>
            <div className="status-pill">
              <Database size={15} />
              <span>Active Chart Synced</span>
            </div>
            <p className="state-text">Uploaded: {new Date(ruleInfo.chart.createdAt).toLocaleString()}</p>

            <div className="stat-stack">
              <div>
                <span>Routes</span>
                <strong>{latestSummary?.routeCount ?? 0}</strong>
              </div>
              <div>
                <span>Stations</span>
                <strong>{latestSummary?.stationCount ?? 0}</strong>
              </div>
              <div>
                <span>Unmatched Rows</span>
                <strong>{latestSummary?.unmatchedLineCount ?? 0}</strong>
              </div>
              <div>
                <span>Per KM Rule</span>
                <strong>{ruleInfo?.rule?.perKmBdt ?? latestSummary?.perKmBdt ?? "N/A"}</strong>
              </div>
            </div>
          </>
        ) : (
          <p className="state-text">No active chart yet. Admin login is required to publish chart data.</p>
        )}
      </aside>
    </div>
  );
}
