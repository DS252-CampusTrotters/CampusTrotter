// transvahan-user/src/screens/FeedbackScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as feedbackApi from "../api/feedback";

type FeedbackEntry = {
  rating?: number | string;
  comment?: string;
  timestamp?: string | number;
  [key: string]: any;
};

type Props = {
  navigation: any;
  route: {
    params?: {
      vehicleId?: string;
      vehicleLabel?: string;
    };
  };
};

const MAX_COMMENT_LEN = 500;

export default function FeedbackScreen({ navigation, route }: Props) {
  const initialVehicleId = route?.params?.vehicleId || "";
  const vehicleLabelFromRoute = route?.params?.vehicleLabel || "";

  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loadingList, setLoadingList] = useState(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const hasLockedVehicle = !!initialVehicleId;

  const loadFeedback = useCallback(async () => {
    const id = vehicleId.trim();
    if (!id) {
      setFeedbackList([]);
      setListError(null);
      return;
    }

    setLoadingList(true);
    setListError(null);
    try {
      const list =
        typeof (feedbackApi as any).getFeedbackForVehicle === "function"
          ? await (feedbackApi as any).getFeedbackForVehicle(id)
          : await (feedbackApi as any).getFeedbackForVehicle(id);
      setFeedbackList(list || []);
    } catch (err: any) {
      console.warn("Load feedback error:", err?.message || err);
      setListError(
        err?.response?.data?.error || "Failed to load feedback. Please try again."
      );
    } finally {
      setLoadingList(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);
  const handleSubmit = async () => {
    if (!vehicleId.trim()) {
      Alert.alert("Vehicle required", "Please enter/select a vehicle ID.");
      return;
    }
    if (!rating || rating < 1 || rating > 5) {
      Alert.alert("Rating required", "Please give a rating between 1 and 5 stars.");
      return;
    }
    if (comment.length > MAX_COMMENT_LEN) {
      Alert.alert(
        "Comment too long",
        `Please keep your comment under ${MAX_COMMENT_LEN} characters.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        vehicle_id: vehicleId.trim(),
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      };

      if (typeof (feedbackApi as any).submitFeedback === "function") {
        await (feedbackApi as any).submitFeedback(payload);
      } else {
        await (feedbackApi as any).submitFeedback(payload);
      }

      // Refresh list
      await loadFeedback();

      Alert.alert("Thank you!", "Your feedback has been submitted.");
    } catch (err: any) {
      console.warn("Submit feedback error:", err?.message || err);
      Alert.alert(
        "Error",
        err?.response?.data?.error ||
          "Failed to submit feedback. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarRow = (value: number, onPressStar?: (v: number) => void) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const filled = i <= value;
      stars.push(
        <TouchableOpacity
          key={i}
          disabled={!onPressStar}
          onPress={() => onPressStar && onPressStar(i)}
          style={{ paddingHorizontal: 2 }}
        >
          <Ionicons
            name={filled ? "star" : "star-outline"}
            size={20}
            color={filled ? "#facc15" : "#9ca3af"}
          />
        </TouchableOpacity>
      );
    }
    return <View style={{ flexDirection: "row" }}>{stars}</View>;
  };

  const renderItem = ({ item }: { item: FeedbackEntry }) => {
    const dateText = item.timestamp
      ? new Date(item.timestamp).toLocaleString()
      : "";

    return (
      <View style={styles.feedbackItem}>
        <View style={styles.feedbackHeader}>
          {renderStarRow(Number(item.rating || 0))}
          {!!dateText && (
            <Text style={styles.feedbackDate}>{dateText}</Text>
          )}
        </View>
        {item.comment ? (
          <Text style={styles.feedbackComment}>{item.comment}</Text>
        ) : (
          <Text style={[styles.feedbackComment, { fontStyle: "italic", color: "#9ca3af" }]}>
            No comment.
          </Text>
        )}
      </View>
    );
  };

  const vehicleDisplay =
    vehicleLabelFromRoute || (vehicleId ? `Vehicle ${vehicleId}` : "Unknown vehicle");

  const avgRating =
    feedbackList && feedbackList.length
      ? feedbackList.reduce((sum, f) => sum + Number(f.rating || 0), 0) / feedbackList.length
      : 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Feedback</Text>
          <Text style={styles.subtitle}>
            Help improve your shuttle experience by rating individual vehicles.
          </Text>
        </View>

        {/* Vehicle selection / display */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Vehicle</Text>
          {hasLockedVehicle ? (
            <>
              <Text style={styles.infoText}>
                You are giving feedback for:
              </Text>
              <Text style={styles.vehicleLabel}>{vehicleDisplay}</Text>
            </>
          ) : (
            <>
              <Text style={styles.infoText}>
                Enter the vehicle ID (as shown on the map or sticker in the
                shuttle).
              </Text>
              <TextInput
                style={styles.input}
                value={vehicleId}
                onChangeText={setVehicleId}
                placeholder="e.g. BUS-12"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={loadFeedback}
              >
                <Ionicons name="refresh" size={16} color="#2563eb" />
                <Text style={styles.refreshText}>Load existing feedback</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Average rating */}
          <View style={styles.avgRow}>
            <Text style={styles.sectionTitleSmall}>Average rating</Text>
            {loadingList ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : feedbackList.length === 0 ? (
              <Text style={styles.infoText}>No ratings yet.</Text>
            ) : (
              <View style={styles.avgRatingRow}>
                {renderStarRow(Math.round(avgRating))}
                <Text style={styles.avgRatingText}>
                  {avgRating.toFixed(1)} ({feedbackList.length}{" "}
                  {feedbackList.length === 1 ? "review" : "reviews"})
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Submit feedback */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your rating</Text>
          <Text style={styles.infoText}>
            Tap to rate your last trip on this vehicle.
          </Text>
          <View style={{ marginTop: 8, marginBottom: 12 }}>
            {renderStarRow(rating, setRating)}
          </View>

          <Text style={styles.sectionTitleSmall}>Comment (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={comment}
            onChangeText={(text) => {
              if (text.length <= MAX_COMMENT_LEN) setComment(text);
            }}
            placeholder="What went well? Was it clean, on-time, crowded, etc.?"
            multiline
            numberOfLines={4}
          />
          <Text style={styles.charCount}>
            {comment.length}/{MAX_COMMENT_LEN}
          </Text>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!vehicleId.trim() || submitting || !rating) && {
                opacity: 0.6,
              },
            ]}
            disabled={!vehicleId.trim() || submitting || !rating}
            onPress={handleSubmit}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitText}>Submit feedback</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Existing feedback list */}
        <View style={styles.card}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionTitle}>Previous feedback</Text>
            {loadingList && (
              <ActivityIndicator size="small" color="#2563eb" />
            )}
          </View>

          {listError && (
            <Text style={[styles.infoText, { color: "#b91c1c" }]}>
              {listError}
            </Text>
          )}

          {!loadingList && !feedbackList.length && !listError ? (
            <Text style={styles.infoText}>
              No feedback yet. Be the first to share your experience!
            </Text>
          ) : (
            <FlatList
              data={feedbackList}
              keyExtractor={(_, idx) => String(idx)}
              renderItem={renderItem}
              scrollEnabled={false}
              contentContainerStyle={{ paddingTop: 4 }}
            />
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  scrollContent: { padding: 12, paddingBottom: 40 },
  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sectionTitleSmall: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginTop: 4,
    marginBottom: 2,
  },
  infoText: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  vehicleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginTop: 6,
    backgroundColor: "#f9fafb",
  },
  textArea: {
    height: 90,
    textAlignVertical: "top",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  refreshText: {
    marginLeft: 4,
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "500",
  },
  avgRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  avgRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  avgRatingText: {
    marginLeft: 6,
    fontSize: 13,
    color: "#4b5563",
  },
  charCount: {
    alignSelf: "flex-end",
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  submitBtn: {
    marginTop: 10,
    backgroundColor: "#2563eb",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feedbackItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  feedbackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feedbackDate: {
    fontSize: 11,
    color: "#9ca3af",
    marginLeft: 8,
  },
  feedbackComment: {
    fontSize: 13,
    color: "#4b5563",
    marginTop: 2,
  },
});