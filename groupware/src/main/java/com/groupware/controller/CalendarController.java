package com.groupware.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.groupware.dto.CalendarEventDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.service.CalendarService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class CalendarController {

	private final CalendarService calendarService;

	// 1.화면 연결 - 사이드바 "일정 캘린더"
	@GetMapping("/calendar")
	public String calendarForm() {
		return "calendar/calendar";
	}

	// 2. 특정 연도/월의 일정 목록 비동기 조회 - 로그인한 사람(employee) 기준으로 조회 범위가 갈림
	// GET /calendar/events?year=2026&month=6
	@ResponseBody
	@GetMapping("/calendar/events")
	public List<CalendarEventDTO> getCalendarEvents(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam("year") int year, @RequestParam("month") int month) {
		return calendarService.getEventsByYearAndMonth(year, month, employee);
	}

	// 3. 새 일정 비동기 등록 - 회사(COMPANY) 일정은 관리자만
	// POST /calendar/events
	@ResponseBody
	@PostMapping("/calendar/events")
	public ResponseEntity<Map<String, Object>> createEvent(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestBody CalendarEventDTO dto) {
		if (!calendarService.canCreateEvent(employee, dto.getEventCategory())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN)
					.body(Map.of("success", false, "message", "회사 일정은 관리자만 등록할 수 있습니다."));
		}
		calendarService.insertEvent(dto, employee);
		return ResponseEntity.ok(Map.of("success", true, "message", "일정이 성공적으로 등록되었습니다."));
	}

	// 4. 특정 일정 비동기 수정 - 개인=본인, 팀=같은 부서, 회사=관리자만 가능
	// POST /calendar/events/{id}
	@ResponseBody
	@PostMapping("/calendar/events/{id}")
	public ResponseEntity<Map<String, Object>> updateEvent(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id, @RequestBody CalendarEventDTO dto) {
		CalendarEventDTO existing = calendarService.getEventForModify(id);
		if (existing == null) {
			return ResponseEntity.notFound().build();
		}
		// canModifyEvent는 "기존" 카테고리 기준으로 수정 권한을 보는 거라, 본인 소유
		// PERSONAL 일정을 수정하는 요청 자체는 통과함. 그런데 그 요청의 eventCategory를
		// "COMPANY"로 바꿔서 보내면(관리자가 아닌데도) 카테고리가 바뀌어버리는 구멍이 있어서,
		// canCreateEvent로 "새로 제출된" 카테고리도 한 번 더 검증한다(2026-07-22 발견)
		if (!calendarService.canModifyEvent(employee, existing) || !calendarService.canCreateEvent(employee, dto.getEventCategory())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN)
					.body(Map.of("success", false, "message", "이 일정을 수정할 권한이 없습니다."));
		}
		dto.setEventId(id);
		calendarService.updateEvent(dto, employee);
		return ResponseEntity.ok(Map.of("success", true, "message", "일정이 성공적으로 수정되었습니다."));
	}

	// 5. 특정 일정 비동기 삭제 - 수정과 동일한 기준
	// DELETE /calendar/events/{id}
	@ResponseBody
	@DeleteMapping("/calendar/events/{id}")
	public ResponseEntity<Map<String, Object>> deleteEvent(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		CalendarEventDTO existing = calendarService.getEventForModify(id);
		if (existing == null) {
			return ResponseEntity.notFound().build();
		}
		if (!calendarService.canModifyEvent(employee, existing)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN)
					.body(Map.of("success", false, "message", "이 일정을 삭제할 권한이 없습니다."));
		}
		calendarService.deleteEvent(id);
		return ResponseEntity.ok(Map.of("success", true, "message", "일정이 성공적으로 삭제되었습니다."));
	}
}