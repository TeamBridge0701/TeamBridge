package com.groupware.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.groupware.dto.AttendanceDTO;
import com.groupware.mapper.AttendanceMapper;

@Service
public class AttendanceService {

	private final AttendanceMapper attendanceMapper;

	public AttendanceService(AttendanceMapper attendanceMapper) {
		this.attendanceMapper = attendanceMapper;
	}

	// 출근 정보 조회
	public AttendanceDTO getTodayAttendance(int employeeId, String today) {
		return attendanceMapper.selectTodayAttendance(employeeId, today);
	}

	// "지금 출근했는지 여부"(NONE 미출근/WORKING 근무중/DONE 퇴근완료) - 그날 지각/정상/연차인지
	// (ATTENDANCE_STATUS: NORMAL/LATE/LEAVE)와는 다른 개념이라 헷갈리지 않게 별도 메서드로 분리.
	// AttendanceController가 원래 인라인으로 계산하던 걸 여기로 옮겨서, 대시보드(MainController)도
	// 같은 기준으로 재사용할 수 있게 함(2026-07-21 김우주 확인 - main.html이 attendanceStatus를
	// 그대로 보여주던 걸 이걸로 교체)
	public String getCommuteStatus(AttendanceDTO todayAttendance) {
		if (todayAttendance == null) {
			return "NONE";
		}
		return todayAttendance.getCheckOutTime() == null ? "WORKING" : "DONE";
	}

	// 위 상태 코드를 화면에 보여줄 한글 라벨로 변환(대시보드 "상태" 표시용)
	public String getCommuteStatusLabel(AttendanceDTO todayAttendance) {
		switch (getCommuteStatus(todayAttendance)) {
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

	// 월간 근태 상태별 건수 집계 - 출결 현황 페이지(attendance.js의 loadAttendanceData())가
	// 클라이언트에서 이미 하고 있는 정상/지각/연차 카운팅과 똑같은 로직을 서버에도 둔 것.
	// 화면(JS)이 없는 곳(대시보드 등 SSR 화면)에서도 같은 집계를 재사용하려고 추가함.
	// "조퇴"는 여기 안 넣음 - ATTENDANCE_STATUS 컬럼 자체가 NORMAL/LATE/LEAVE 셋만 허용해서
	// (ERD_설계서.md 2-4 확정 사항) 애초에 셀 수 있는 데이터가 없음(2026-07-21 김우주 확인).
	public Map<String, Long> getMonthlySummary(int employeeId, int year, int month) {
		List<AttendanceDTO> records = getMonthlyAttendance(employeeId, year, month);

		Map<String, Long> summary = new HashMap<>();
		// .filter()로 그 상태인 것만 걸러내고 .count()로 몇 개인지 센다
		summary.put("normal", records.stream().filter(a -> "NORMAL".equals(a.getAttendanceStatus())).count());
		summary.put("late", records.stream().filter(a -> "LATE".equals(a.getAttendanceStatus())).count());
		summary.put("leave", records.stream().filter(a -> "LEAVE".equals(a.getAttendanceStatus())).count());
		return summary;
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