package com.groupware.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
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