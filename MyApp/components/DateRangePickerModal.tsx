import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Switch,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type DateVal = { month: number; year: number }; // month 0-11

interface Props {
  visible: boolean;
  /** "year" → shows only year picker (e.g. 2020 – 2024).
   *  "monthYear" → shows month + year (e.g. Jan 2020 – Dec 2022). */
  mode: "year" | "monthYear";
  /** Pre-fill from the current text value */
  initialValue?: string;
  onConfirm: (formatted: string) => void;
  onCancel: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Try to parse a human range string back into start / end objects.
 *  Handles: "2020 – 2024", "Jan 2020 – Dec 2022", "Jan 2020 – Present" */
function parseRange(
  s: string | undefined,
  mode: "year" | "monthYear",
): { start: DateVal; end: DateVal; present: boolean } {
  const now = new Date();
  const defaults = {
    start: { month: 0, year: now.getFullYear() },
    end: { month: now.getMonth(), year: now.getFullYear() },
    present: false,
  };
  if (!s) return defaults;

  // Normalise dashes
  const normalised = s.replace(/\s*[-–—]\s*/g, " – ");
  const parts = normalised.split(" – ");

  const parseToken = (tok: string): DateVal => {
    const trimmed = tok.trim();
    // "Jan 2020"
    const monthMatch = trimmed.match(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i,
    );
    if (monthMatch) {
      const mIdx = MONTHS_SHORT.findIndex(
        (m) => m.toLowerCase() === monthMatch[1].toLowerCase(),
      );
      return { month: mIdx >= 0 ? mIdx : 0, year: Number(monthMatch[2]) };
    }
    // "2020"
    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) return { month: 0, year: Number(yearMatch[1]) };
    return { month: 0, year: now.getFullYear() };
  };

  if (parts.length >= 2) {
    const isPresent =
      parts[1].trim().toLowerCase() === "present" ||
      parts[1].trim().toLowerCase() === "";
    return {
      start: parseToken(parts[0]),
      end: isPresent ? defaults.end : parseToken(parts[1]),
      present: isPresent,
    };
  }

  // Single token – use as start
  return { start: parseToken(parts[0]), end: defaults.end, present: false };
}

function formatRange(
  start: DateVal,
  end: DateVal,
  present: boolean,
  mode: "year" | "monthYear",
): string {
  if (mode === "year") {
    const s = `${start.year}`;
    const e = present ? "Present" : `${end.year}`;
    return `${s} – ${e}`;
  }
  const s = `${MONTHS_SHORT[start.month]} ${start.year}`;
  const e = present ? "Present" : `${MONTHS_SHORT[end.month]} ${end.year}`;
  return `${s} – ${e}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function DateRangePickerModal({
  visible,
  mode,
  initialValue,
  onConfirm,
  onCancel,
}: Props) {
  const [tab, setTab] = useState<"start" | "end">("start");
  const [start, setStart] = useState<DateVal>({ month: 0, year: 2020 });
  const [end, setEnd] = useState<DateVal>({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });
  const [present, setPresent] = useState(false);

  // Browsing year for the month-grid (independent from selected value)
  const [browseYear, setBrowseYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (visible) {
      const parsed = parseRange(initialValue, mode);
      setStart(parsed.start);
      setEnd(parsed.end);
      setPresent(parsed.present);
      setTab("start");
      setBrowseYear(parsed.start.year);
    }
  }, [visible, initialValue, mode]);

  // When switching tabs, jump browseYear to that tab's year
  useEffect(() => {
    if (tab === "start") setBrowseYear(start.year);
    else setBrowseYear(end.year);
  }, [tab]);

  const active = tab === "start" ? start : end;
  const setActive = tab === "start" ? setStart : setEnd;

  const selectMonth = (mIdx: number) => {
    setActive({ month: mIdx, year: browseYear });
  };

  const selectYear = (y: number) => {
    setActive({ ...active, year: y });
    setBrowseYear(y);
  };

  const handleConfirm = () => {
    onConfirm(formatRange(start, end, present, mode));
  };

  /* ---- Year-only mode: render a year grid ---- */
  const renderYearGrid = () => {
    const baseYear = Math.floor(browseYear / 12) * 12;
    const years = Array.from({ length: 12 }, (_, i) => baseYear + i);
    return (
      <View>
        <View style={s.navRow}>
          <TouchableOpacity onPress={() => setBrowseYear(baseYear - 12)}>
            <Ionicons name="chevron-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={s.navTitle}>
            {years[0]} – {years[years.length - 1]}
          </Text>
          <TouchableOpacity onPress={() => setBrowseYear(baseYear + 12)}>
            <Ionicons name="chevron-forward" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={s.grid}>
          {years.map((y) => {
            const selected = y === active.year;
            return (
              <TouchableOpacity
                key={y}
                style={[s.cell, selected && s.cellSelected]}
                onPress={() => selectYear(y)}
              >
                <Text style={[s.cellText, selected && s.cellTextSelected]}>
                  {y}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  /* ---- Month-year mode: year nav + month grid ---- */
  const renderMonthGrid = () => (
    <View>
      <View style={s.navRow}>
        <TouchableOpacity onPress={() => setBrowseYear(browseYear - 1)}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={s.navTitle}>{browseYear}</Text>
        <TouchableOpacity onPress={() => setBrowseYear(browseYear + 1)}>
          <Ionicons name="chevron-forward" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      <View style={s.grid}>
        {MONTHS_SHORT.map((m, idx) => {
          const selected = idx === active.month && browseYear === active.year;
          return (
            <TouchableOpacity
              key={m}
              style={[s.cell, selected && s.cellSelected]}
              onPress={() => selectMonth(idx)}
            >
              <Text style={[s.cellText, selected && s.cellTextSelected]}>
                {m}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  /* ---- Summary labels ---- */
  const startLabel =
    mode === "year"
      ? `${start.year}`
      : `${MONTHS_SHORT[start.month]} ${start.year}`;
  const endLabel = present
    ? "Present"
    : mode === "year"
      ? `${end.year}`
      : `${MONTHS_SHORT[end.month]} ${end.year}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Tabs */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, tab === "start" && s.tabActive]}
              onPress={() => setTab("start")}
            >
              <Text style={[s.tabText, tab === "start" && s.tabTextActive]}>
                From
              </Text>
              <Text style={[s.tabValue, tab === "start" && s.tabValueActive]}>
                {startLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, tab === "end" && s.tabActive]}
              onPress={() => {
                if (!present) setTab("end");
              }}
              disabled={present}
            >
              <Text
                style={[
                  s.tabText,
                  tab === "end" && s.tabTextActive,
                  present && s.tabDisabled,
                ]}
              >
                To
              </Text>
              <Text
                style={[
                  s.tabValue,
                  tab === "end" && s.tabValueActive,
                  present && s.tabDisabled,
                ]}
              >
                {endLabel}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Grid */}
          {!(tab === "end" && present) &&
            (mode === "year" ? renderYearGrid() : renderMonthGrid())}

          {/* Present toggle */}
          <View style={s.presentRow}>
            <Text style={s.presentLabel}>Currently ongoing</Text>
            <Switch
              value={present}
              onValueChange={(v) => {
                setPresent(v);
                if (v && tab === "end") setTab("start");
              }}
              trackColor={{ false: "#d1d5db", true: "#93c5fd" }}
              thumbColor={present ? "#2563eb" : "#f4f3f4"}
            />
          </View>

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
              <Text style={s.confirmBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
  },
  tabText: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  tabTextActive: { color: "#dbeafe" },
  tabValue: { fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 2 },
  tabValueActive: { color: "#fff" },
  tabDisabled: { color: "#d1d5db" },

  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  cell: {
    width: "23%",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  cellSelected: { backgroundColor: "#2563eb" },
  cellText: { fontSize: 14, fontWeight: "500", color: "#374151" },
  cellTextSelected: { color: "#fff", fontWeight: "700" },

  presentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  presentLabel: { fontSize: 14, color: "#374151", fontWeight: "500" },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#2563eb",
  },
  confirmBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});
