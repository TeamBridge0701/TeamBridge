package com.groupware.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.groupware.dto.CalendarEventDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.CalendarMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CalendarService {

    private final CalendarMapper calendarMapper;

    /**
     * 특정 연도/월 일정 목록 조회 - 개인=본인 것만, 팀=같은 부서만, 회사=전체
     */
    public List<CalendarEventDTO> getEventsByYearAndMonth(int year, int month, EmployeeDTO viewer) {
        return calendarMapper.selectEventsByYearAndMonth(year, month, viewer.getEmployeeId(), viewer.getDeptId());
    }

    /**
     * 회사(COMPANY) 일정은 관리자만 등록 가능
     */
    public boolean canCreateEvent(EmployeeDTO employee, String eventCategory) {
        if ("COMPANY".equals(eventCategory)) {
            return "ADMIN".equals(employee.getEmployeeRole());
        }
        return true;
    }

    /**
     * 새 일정 등록 - 등록자/부서는 클라이언트 값을 믿지 않고 로그인 사용자 기준으로 서버에서 채운다
     */
    public void insertEvent(CalendarEventDTO dto, EmployeeDTO writer) {
        dto.setEmployeeId(writer.getEmployeeId());
        dto.setDeptId("TEAM".equals(dto.getEventCategory()) ? writer.getDeptId() : null);
        calendarMapper.insertEvent(dto);
    }

    /**
     * 수정/삭제 권한 재검증용 단건 조회
     */
    public CalendarEventDTO getEventForModify(int eventId) {
        return calendarMapper.selectEventById(eventId);
    }

    /**
     * 수정/삭제 권한 판단
     * - 회사 일정: 관리자 전체
     * - 팀 일정: 같은 부서 소속(직급 무관)
     * - 개인 일정: 작성자 본인만
     */
    public boolean canModifyEvent(EmployeeDTO employee, CalendarEventDTO event) {
        if ("COMPANY".equals(event.getEventCategory())) {
            return "ADMIN".equals(employee.getEmployeeRole());
        }
        if ("TEAM".equals(event.getEventCategory())) {
            return event.getDeptId() != null && employee.getDeptId() == event.getDeptId();
        }
        return employee.getEmployeeId() == event.getEmployeeId();
    }

    /**
     * 일정 수정 - 카테고리가 TEAM으로 바뀌면 수정하는 사람 기준 부서로 다시 고정
     */
    public void updateEvent(CalendarEventDTO dto, EmployeeDTO editor) {
        dto.setDeptId("TEAM".equals(dto.getEventCategory()) ? editor.getDeptId() : null);
        calendarMapper.updateEvent(dto);
    }

    /**
     * 일정 삭제
     */
    public void deleteEvent(int eventId) {
        calendarMapper.deleteEvent(eventId);
    }
}