package com.groupware.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.groupware.dto.AttendanceDTO;
import com.groupware.security.CustomUserDetails;
import com.groupware.service.AttendanceService;

//@RestController를 안 쓰고 @Controller + @ResponseBody 조합으로 바꾼 이유는 컨트롤러 안에서
//화면(HTML 파일)과 데이터(JSON)를 동시에 처리해야 하기 때문

@Controller
@RequestMapping("attendance")
public class AttendanceController {

	private final AttendanceService attendanceService;

	public AttendanceController(AttendanceService attendanceService) {
		this.attendanceService = attendanceService;
	}

	// 화면 연결
	@GetMapping
	public String attendanceForm() {
		return "attendance/attendance";
	}

	// 1. 상태 및 대시보드 정보 조회 API
	// @ResponseBody쓰는 이유 => 이 메서드가 리턴하는 데이터를 HTML 화면 파일(템플릿)로 찾지 말고
	// 순수한 데이터(JSON 등) 그대로 브라우저나 클라이언트에게 보내기위해 사용
	@ResponseBody
	@GetMapping("/status")
	public Map<String, Object> getStatus(@AuthenticationPrincipal CustomUserDetails user) {
		return getAttendanceData(user.getEmployeeDTO().getEmployeeId());
	}

	// 2. 출근 처리 API
	@ResponseBody
	@PostMapping("/checkIn")
	public Map<String, Object> checkIn(@AuthenticationPrincipal CustomUserDetails user) {
		attendanceService.checkIn(user.getEmployeeDTO().getEmployeeId());
		return getAttendanceData(user.getEmployeeDTO().getEmployeeId());
	}

	// 3. 퇴근 처리 API
	@ResponseBody
	@PostMapping("/checkOut")
	public Map<String, Object> checkOut(@AuthenticationPrincipal CustomUserDetails user) {
		attendanceService.checkOut(user.getEmployeeDTO().getEmployeeId());
		return getAttendanceData(user.getEmployeeDTO().getEmployeeId());
	}

	// 4. 출퇴근정보 attendance.html에 뿌려주기
	@ResponseBody
	@GetMapping("/monthly")
	public List<AttendanceDTO> getMonthlyAttendance(@AuthenticationPrincipal CustomUserDetails user,
			@RequestParam("year") int year, @RequestParam("month") int month) {

		int employeeId = user.getEmployeeDTO().getEmployeeId();
		return attendanceService.getMonthlyAttendance(employeeId, year, month);
	}

	// 공통 응답 메서드 (상태 + 대시보드 정보 통합)
	private Map<String, Object> getAttendanceData(int employeeId) {
		String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
		AttendanceDTO dto = attendanceService.getTodayAttendance(employeeId, today);

		Map<String, Object> response = new HashMap<>();

		// "지금 출근했는지" 상태(NONE/WORKING/DONE) 계산은 AttendanceService로 옮김 - 대시보드도
		// 같은 기준을 재사용하기 때문(AttendanceService.getCommuteStatus 참고)
		String status = attendanceService.getCommuteStatus(dto);

		response.put("success", true);
		response.put("nextStatus", status);
		response.put("attendanceStatus", (dto != null) ? dto.getAttendanceStatus() : "미출근");
		response.put("checkInTime",
				(dto != null && dto.getCheckInTime() != null) ? dto.getCheckInTime().substring(0, 5) : "-"); // HH:mm으로
		response.put("checkOutTime",
				(dto != null && dto.getCheckOutTime() != null) ? dto.getCheckOutTime().substring(0, 5) : "-"); // HH:mm으로

		// 대시보드 "월간 근태 요약" 카드(출근일수/지각/연차/출근율)도 이 응답에 같이 실어보낸다 -
		// 출근/퇴근 버튼을 누른 직후 그 카드가 새로고침 없이 바로 갱신되게 하기 위함
		// (DashboardService가 페이지 최초 렌더링 때 쓰는 것과 동일한 메서드 재사용, 2026-07-22)
		response.putAll(attendanceService.getAttendanceSummary(employeeId, LocalDate.now()));

		return response;
	}
}
