package com.groupware.service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.groupware.dto.AttendanceDTO;
import com.groupware.dto.CalendarEventDTO;
import com.groupware.mapper.AttendanceMapper;
import com.groupware.mapper.CalendarMapper;

@Service
public class AttendanceService {

	private final AttendanceMapper attendanceMapper;
	private final CalendarMapper calendarMapper;

	public AttendanceService(AttendanceMapper attendanceMapper, CalendarMapper calendarMapper) {
		this.attendanceMapper = attendanceMapper;
		this.calendarMapper = calendarMapper;
	}

	// 출근 정보 조회
	public AttendanceDTO getTodayAttendance(int employeeId, String today) {
		return attendanceMapper.selectTodayAttendance(employeeId, today);
	}

	// "지금 출근했는지 여부"(NONE 미출근/WORKING 근무중/DONE 퇴근완료/LEAVE 휴가중) - 그날
	// 지각/정상/연차인지(ATTENDANCE_STATUS: NORMAL/LATE/LEAVE)와는 다른 개념이라 헷갈리지 않게
	// 별도 메서드로 분리. AttendanceController가 원래 인라인으로 계산하던 걸 여기로 옮겨서,
	// 대시보드(MainController)도 같은 기준으로 재사용할 수 있게 함(2026-07-21 김우주 확인 -
	// main.html이 attendanceStatus를 그대로 보여주던 걸 이걸로 교체).
	//
	// LEAVE는 별도 분기로 먼저 처리한다 - 연차 승인 시 자동 생성되는 레코드
	// (insertLeaveRecord)는 CHECK_IN_TIME/CHECK_OUT_TIME을 둘 다 안 채우고 ATTENDANCE_STATUS만
	// 'LEAVE'로 넣는데, 이걸 그냥 checkOutTime==null로만 판단하면 "출근도 안 했는데 근무중"으로
	// 잘못 나온다(2026-07-21 발견된 버그 - checkInTime을 아예 안 보고 있었음).
	public String getCommuteStatus(AttendanceDTO todayAttendance) {
		if (todayAttendance == null) {
			return "NONE";
		}
		if ("LEAVE".equals(todayAttendance.getAttendanceStatus())) {
			return "LEAVE";
		}
		return todayAttendance.getCheckOutTime() == null ? "WORKING" : "DONE";
	}

	// 위 상태 코드를 화면에 보여줄 한글 라벨로 변환(대시보드 "상태" 표시용)
	public String getCommuteStatusLabel(AttendanceDTO todayAttendance) {
		switch (getCommuteStatus(todayAttendance)) {
			case "LEAVE": return "휴가중";
			case "WORKING": return "근무중";
			case "DONE": return "퇴근완료";
			default: return "미출근";
		}
	}

	// 출근 처리 - 9시 넘으면 지각 처리
	@Transactional
	public void checkIn(int employeeId) {
		LocalDate today = LocalDate.now();
		String todayStr = today.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

		if (attendanceMapper.selectTodayAttendance(employeeId, todayStr) != null) {
			throw new IllegalStateException("이미 오늘 출근 처리가 완료되었습니다.");
		}

		LocalTime nowTime = LocalTime.now();
		String status = nowTime.isAfter(LocalTime.of(9, 0, 0)) ? "LATE" : "NORMAL";
		String formattedTime = nowTime.format(DateTimeFormatter.ofPattern("HH:mm:ss"));

		attendanceMapper.insertCheckIn(employeeId, todayStr, formattedTime, status);
	}

	// 퇴근 처리
	@Transactional
	public void checkOut(int employeeId) {
		LocalDate today = LocalDate.now();
		String todayStr = today.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

		AttendanceDTO attendance = attendanceMapper.selectTodayAttendance(employeeId, todayStr);

		if (attendance == null) {
			throw new IllegalStateException("출근 기록이 없어 퇴근 처리가 불가능합니다.");
		}
		if (attendance.getCheckOutTime() != null) {
			throw new IllegalStateException("이미 오늘 퇴근 처리가 완료되었습니다.");
		}

		String formattedTime = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));

		attendanceMapper.updateCheckOut(employeeId, todayStr, formattedTime);
	}
	public List<AttendanceDTO> getMonthlyAttendance(int employeeId, int year, int month) {
		String startDate = String.format("%d-%02d-01", year, month);
		
		LocalDate startLocalDate = LocalDate.of(year, month, 1);
		String endDate = startLocalDate.withDayOfMonth(startLocalDate.lengthOfMonth())
				.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

		return attendanceMapper.selectAttendanceByPeriod(employeeId, startDate, endDate);
	}

	// 그 달의 공휴일(IS_HOLIDAY=1인 COMPANY 일정) 날짜를 하루 단위로 펼친 집합.
	// 대체공휴일처럼 여러 날짜에 걸친 일정도 있을 수 있어 시작~종료를 하루씩 순회한다.
	// countWorkingDaysInMonth(분모)와 getMonthlySummary(분자)가 "근무일" 판단 기준을
	// 여기 하나로 공유해야, 기준이 갈려서 다시 100% 넘는 문제가 생기지 않는다(2026-07-22).
	private Set<LocalDate> getHolidayDatesInMonth(int year, int month) {
		Set<LocalDate> holidays = new HashSet<>();
		for (CalendarEventDTO holiday : calendarMapper.selectHolidayDates(year, month)) {
			LocalDate date = LocalDate.parse(holiday.getStartDate());
			LocalDate end = LocalDate.parse(holiday.getEndDate());
			while (!date.isAfter(end)) {
				holidays.add(date);
				date = date.plusDays(1);
			}
		}
		return holidays;
	}

	// 그 날짜가 "근무일"인지(주말도 아니고 공휴일도 아님) 판단
	private boolean isWorkingDay(LocalDate date, Set<LocalDate> holidays) {
		boolean isWeekend = date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
		return !isWeekend && !holidays.contains(date);
	}

	// 월간 근태 상태별 건수 집계 - 출결 현황 페이지(attendance.js의 loadAttendanceData())가
	// 클라이언트에서 이미 하고 있는 정상/지각/연차 카운팅과 똑같은 로직을 서버에도 둔 것.
	// 화면(JS)이 없는 곳(대시보드 등 SSR 화면)에서도 같은 집계를 재사용하려고 추가함.
	// "조퇴"는 여기 안 넣음 - ATTENDANCE_STATUS 컬럼 자체가 NORMAL/LATE/LEAVE 셋만 허용해서
	// (ERD_설계서.md 2-4 확정 사항) 애초에 셀 수 있는 데이터가 없음(2026-07-21 김우주 확인).
	//
	// 주말/공휴일에 찍힌 기록(특근, 관리자 수기입력, 연차가 실수로 주말에 걸친 경우 등)은
	// 여기서 집계 대상에서 뺀다 - 분모(countWorkingDaysInMonth)도 근무일만 세므로 기준을
	// 맞춰야 출근율이 100%를 넘지 않는다(2026-07-22 근무일 기준 집계로 결정).
	public Map<String, Long> getMonthlySummary(int employeeId, int year, int month) {
		List<AttendanceDTO> records = getMonthlyAttendance(employeeId, year, month);
		Set<LocalDate> holidays = getHolidayDatesInMonth(year, month);
		List<AttendanceDTO> workingDayRecords = records.stream()
				.filter(a -> isWorkingDay(LocalDate.parse(a.getWorkDate()), holidays))
				.collect(Collectors.toList());

		Map<String, Long> summary = new HashMap<>();
		// .filter()로 그 상태인 것만 걸러내고 .count()로 몇 개인지 센다
		summary.put("normal", workingDayRecords.stream().filter(a -> "NORMAL".equals(a.getAttendanceStatus())).count());
		summary.put("late", workingDayRecords.stream().filter(a -> "LATE".equals(a.getAttendanceStatus())).count());
		summary.put("leave", workingDayRecords.stream().filter(a -> "LEAVE".equals(a.getAttendanceStatus())).count());
		return summary;
	}

	// 그 달 전체(1일~말일) 중 근무일(평일이면서 공휴일이 아닌 날) 개수 - 출근율 분모.
	// 예전엔 "오늘까지"만 셌는데(countWorkingDaysSoFar), 그러면 이번 달에 미리 반영된
	// 미래 날짜 연차 기록(분자) 때문에 분모보다 분자가 커져 100%를 넘는 문제가 있어서
	// 그 달 전체로 바꿨다(2026-07-22).
	public int countWorkingDaysInMonth(int year, int month) {
		Set<LocalDate> holidays = getHolidayDatesInMonth(year, month);
		LocalDate first = LocalDate.of(year, month, 1);
		LocalDate last = first.withDayOfMonth(first.lengthOfMonth());

		int count = 0;
		for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
			if (isWorkingDay(date, holidays)) {
				count++;
			}
		}
		return count;
	}

	// 월간 근태 요약(출근일수/지각/연차/출근율)을 한 번에 계산 - AttendanceController(출근/퇴근
	// 처리 직후 실시간 갱신 + attendance.html 이전/다음 달 조회용)와 DashboardService(페이지
	// 최초 렌더링용) 셋 다 이 메서드 하나만 부르면 되도록 통일함. 원래 LocalDate today를 받아
	// "이번 달"만 계산했는데, attendance.html 카드가 자체적으로 클라이언트에서 따로 집계하다
	// 보니(주말/공휴일 필터링이 안 돼 있어서) 대시보드 카드와 숫자가 어긋나는 문제가 있어
	// year/month를 직접 받게 바꿔서 attendance.html도 이 메서드를 그대로 쓰게 함(2026-07-22).
	public Map<String, Object> getAttendanceSummary(int employeeId, int year, int month) {
		Map<String, Long> statusCounts = getMonthlySummary(employeeId, year, month);
		long normalCount = statusCounts.get("normal");
		long lateCount = statusCounts.get("late");
		long leaveCount = statusCounts.get("leave");
		// "출근일수"는 정상+지각+연차를 전부 "그 날에 대해 근태 기록이 남아있다"는 의미로 합쳐서 센다
		long presentDays = normalCount + lateCount + leaveCount;

		int workingDays = countWorkingDaysInMonth(year, month);
		// workingDays가 0이면(이론상 그 달 전체가 주말/공휴일뿐일 때) 0으로 나누기 에러 방지
		int attendanceRate = workingDays > 0 ? (int) Math.round(presentDays * 100.0 / workingDays) : 0;

		Map<String, Object> result = new HashMap<>();
		result.put("presentDays", presentDays);
		result.put("lateCount", lateCount);
		result.put("leaveCount", leaveCount);
		result.put("attendanceRate", attendanceRate);
		return result;
	}
	
	// 관리자 : 특정 날짜의 전 직원 출결 조회
	public List<AttendanceDTO> getAttendanceByDate(String data){
		return attendanceMapper.selectAttendanceByDate(LocalDate.parse(data));
	}
	
	// 관리자가 직접 입력하는 식나이라 형식이 자유로울 수 있음 - DB(TIME 컬럼)에 이상한 값이
	// 들어가기 전에 서버에서 한 번 더 검증(화면 input이 text라 브라우저가 형식을 안 막아줌)
	private static final Pattern TIME_PATTERN = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");
	
	public void saveAttendanceByAdmin(int employeeId, String workDate, String checkInTime, String checkOutTime,
									String status) {
		if (checkInTime != null && !checkInTime.isBlank() && !TIME_PATTERN.matcher(checkInTime).matches()) {
			throw new IllegalArgumentException("출근 시간 형식이 올바르지 않습니다. (예: 09:00)");
		}
		if (checkOutTime != null && !checkOutTime.isBlank() && !TIME_PATTERN.matcher(checkOutTime).matches()) {
			throw new IllegalArgumentException("퇴근 시간 형식이 올바르지 않습니다. (예: 18:00)");
	    }
		
		attendanceMapper.upsertAttendanceByAdmin(employeeId, workDate,
				checkInTime == null || checkInTime.isBlank() ? null : checkInTime,
				checkOutTime == null || checkOutTime.isBlank() ? null : checkOutTime,
				status);
	}

}