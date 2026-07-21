package com.groupware.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.groupware.dto.CalendarEventDTO;
import com.groupware.service.CalendarService; // 서비스 패키지 경로에 맞게 임포트

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/calendar/events")
@RequiredArgsConstructor
public class CalendarController {

    // 직접 만드실 CalendarService 주입
    private final CalendarService calendarService;

    /**
     * 1. 특정 연도/월의 일정 목록 비동기 조회
     * GET /api/calendar/events?year=2026&month=6
     */
    @GetMapping
    public ResponseEntity<List<CalendarEventDTO>> getCalendarEvents(
            @RequestParam("year") int year,
            @RequestParam("month") int month) {
        
        System.out.println("비동기 일정 조회 요청 - 연도: " + year + ", 월: " + month);
        
        // 서비스 레이어 호출 (예정된 메서드명: getEventsByYearAndMonth)
        List<CalendarEventDTO> events = calendarService.getEventsByYearAndMonth(year, month);
        
        return ResponseEntity.ok(events);
    }

    /**
     * 2. 새 일정 비동기 등록
     * POST /api/calendar/events
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createEvent(@RequestBody CalendarEventDTO dto) {
        System.out.println("비동기 새 일정 등록 요청: " + dto);
        
        // 서비스 레이어 호출 (예정된 메서드명: insertEvent)
        calendarService.insertEvent(dto);
        
        return ResponseEntity.ok(Map.of("success", true, "message", "일정이 성공적으로 등록되었습니다."));
    }

    /**
     * 3. 특정 일정 비동기 수정
     * POST /api/calendar/events/{id}
     */
    @PostMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateEvent(
            @PathVariable("id") int id, 
            @RequestBody CalendarEventDTO dto) {
        
        System.out.println("비동기 일정 수정 요청 - ID: " + id + ", 내역: " + dto);
        dto.setEventId(id);
        
        // 서비스 레이어 호출 (예정된 메서드명: updateEvent)
        calendarService.updateEvent(dto);
        
        return ResponseEntity.ok(Map.of("success", true, "message", "일정이 성공적으로 수정되었습니다."));
    }

    /**
     * 4. 특정 일정 비동기 삭제
     * DELETE /api/calendar/events/{id}
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteEvent(@PathVariable("id") int id) {
        System.out.println("비동기 일정 삭제 요청 - ID: " + id);
        
        // 서비스 레이어 호출 (예정된 메서드명: deleteEvent)
        calendarService.deleteEvent(id);
        
        return ResponseEntity.ok(Map.of("success", true, "message", "일정이 성공적으로 삭제되었습니다."));
    }
}