package vn.edu.phenikaa.better_phenikaa_schedule

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.AlarmClock
import java.util.Calendar
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

// Delegates to the device's real Clock app. BPA never schedules its own alarm.
internal object StudyAlarmBridge {
    private const val CHANNEL = "better_phenikaa/study_alarm"

    fun attach(activity: Activity, messenger: BinaryMessenger) {
        MethodChannel(messenger, CHANNEL).setMethodCallHandler { call, result ->
            val label = call.argument<String>("label")
                ?.takeIf { it.isNotBlank() }
                ?.take(120)
            if (label == null) {
                result.error("invalid_label", "Không có mã báo thức hợp lệ.", null)
                return@setMethodCallHandler
            }
            val request = when (call.method) {
                "setAlarm" -> {
                    val hour = call.argument<Int>("hour")
                    val minute = call.argument<Int>("minute")
                    val targetMs = call.argument<Long>("target")
                    val classMs = call.argument<Long>("classStart")
                    if (hour == null || hour !in 0..23 || minute == null || minute !in 0..59 ||
                        targetMs == null || classMs == null
                    ) {
                        result.error("invalid_time", "Giờ báo thức không hợp lệ.", null)
                        return@setMethodCallHandler
                    }
                    val now = System.currentTimeMillis()
                    val remaining = classMs - now
                    if (remaining <= 0L || remaining >= 24L * 60 * 60 * 1000) {
                        result.error("outside_window", "Chỉ đặt báo thức cho môn sắp bắt đầu trong dưới 24 giờ.", null)
                        return@setMethodCallHandler
                    }
                    val classDate = Calendar.getInstance().apply { timeInMillis = classMs }
                    val desired = Calendar.getInstance().apply { timeInMillis = targetMs }
                    if (desired.get(Calendar.HOUR_OF_DAY) != hour ||
                        desired.get(Calendar.MINUTE) != minute ||
                        targetMs <= now + 30_000L || targetMs >= classMs ||
                        desired.get(Calendar.YEAR) != classDate.get(Calendar.YEAR) ||
                        desired.get(Calendar.DAY_OF_YEAR) != classDate.get(Calendar.DAY_OF_YEAR)
                    ) {
                        result.error("past_alarm", "Giờ báo thức đã qua hoặc không hợp lệ.", null)
                        return@setMethodCallHandler
                    }
                    // Guard against default Clock creating an alarm tomorrow instead
                    // of the day displayed in BPA.
                    val next = Calendar.getInstance().apply {
                        timeInMillis = now
                        set(Calendar.HOUR_OF_DAY, hour)
                        set(Calendar.MINUTE, minute)
                        set(Calendar.SECOND, 0)
                        set(Calendar.MILLISECOND, 0)
                        if (timeInMillis <= now + 30_000L) add(Calendar.DAY_OF_MONTH, 1)
                    }
                    if (next.get(Calendar.YEAR) != desired.get(Calendar.YEAR) ||
                        next.get(Calendar.DAY_OF_YEAR) != desired.get(Calendar.DAY_OF_YEAR)
                    ) {
                        result.error("wrong_day", "Giờ này Đồng hồ sẽ đặt khác ngày học.", null)
                        return@setMethodCallHandler
                    }
                    Intent(AlarmClock.ACTION_SET_ALARM).apply {
                        putExtra(AlarmClock.EXTRA_HOUR, hour)
                        putExtra(AlarmClock.EXTRA_MINUTES, minute)
                        putExtra(AlarmClock.EXTRA_MESSAGE, label)
                        putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                    }
                }
                "dismissAlarm" -> Intent(AlarmClock.ACTION_DISMISS_ALARM).apply {
                    // Search only the unique label created by BPA; never dismiss
                    // all alarms or an unrelated alarm at the same time.
                    putExtra(
                        AlarmClock.EXTRA_ALARM_SEARCH_MODE,
                        AlarmClock.ALARM_SEARCH_MODE_LABEL,
                    )
                    putExtra(AlarmClock.EXTRA_MESSAGE, label)
                }
                else -> {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
            }
            try {
                activity.startActivity(request)
                // Dispatch success only. Clock apps do not return saved/deleted
                // alarm IDs, success status, or an exact date via this API.
                result.success(true)
            } catch (_: ActivityNotFoundException) {
                result.error("no_clock", "Đồng hồ không hỗ trợ thao tác này.", null)
            } catch (error: SecurityException) {
                result.error("clock_denied", error.message ?: "Đồng hồ từ chối yêu cầu.", null)
            } catch (error: Exception) {
                result.error("clock_failed", error.message ?: "Không thể gửi lệnh tới Đồng hồ.", null)
            }
        }
    }
}
