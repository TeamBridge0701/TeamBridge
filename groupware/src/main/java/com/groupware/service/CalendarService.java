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
     * 회사(COMPANY) 일정은 관리자만, 팀(TEAM) 일정은 관리자는 등록 불가(관리자는 소속 부서가 없음)
     */
    public boolean canCreateEvent(EmployeeDTO employee, String eventCategory) {
        boolean isAdmin = "ADMIN".equals(employee.getEmployeeRole());
        if ("COMPANY".equals(eventCategory)) {
            return isAdmin;
        }
        if ("TEAM".equals(eventCategory)) {
            // 관리자는 DEPT_ID가 없는 시스템 계정이라 "소속 부서"라는 개념 자체가 없음
            return !isAdmin;
        }
        return true;
    }

    /**
     * 새 일정 등록 - 등록자/부서는 클라이언트 값을 믿지 않고 로그인 사용자 기준으로 서버에서 채운다.
     * isHoliday도 COMPANY가 아니면 클라이언트가 뭘 보냈든 강제로 false - PERSONAL/TEAM 일정이
     * 실수로(혹은 조작으로) 공휴일 취급되어 출근율 계산에서 빠지는 걸 막기 위함.
     * 여기 도달하는 시점엔 이미 컨트롤러의 canCreateEvent()가 COMPANY=관리자만 걸러낸
     * 뒤라서 "COMPANY".equals(...)만 봐도 안전함(2026-07-22)
     */
    public void insertEvent(CalendarEventDTO dto, EmployeeDTO writer) {
        dto.setEmployeeId(writer.getEmployeeId());
        dto.setDeptId("TEAM".equals(dto.getEventCategory()) ? writer.getDeptId() : null);
        dto.setHoliday("COMPANY".equals(dto.getEventCategory()) && dto.isHoliday());
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
        boolean isAdmin = "ADMIN".equals(employee.getEmployeeRole());
        if ("COMPANY".equals(event.getEventCategory())) {
            return isAdmin;
        }
        if ("TEAM".equals(event.getEventCategory())) {
            // 관리자는 소속 부서(DEPT_ID)가 없어 TEAM 일정을 등록할 수 없으므로,
            // 수정/삭제도 부서 비교 이전에 무조건 차단(canCreateEvent와 동일 원칙)
            if (isAdmin) {
                return false;
            }
            return event.getDeptId() != null && employee.getDeptId() == event.getDeptId();
        }
        return employee.getEmployeeId() == event.getEmployeeId();
    }

    /**
     * 일정 수정 - 카테고리가 TEAM으로 바뀌면 수정하는 사람 기준 부서로 다시 고정.
     * isHoliday도 등록과 같은 원칙(COMPANY가 아니면 강제 false)으로 처리.
     * "관리자가 아닌 사람이 카테고리 자체를 COMPANY로 바꾸려는 시도" 차단은 여기가 아니라
     * CalendarController에서 canCreateEvent()로 미리 막는다(getEventForModify로 조회한
     * "기존" 카테고리만 검사하는 canModifyEvent와 달리, 새로 제출되는 카테고리를 검증해야
     * 하는 문제라 기존 등록 검증 로직을 그대로 재사용하는 게 맞음 - 2026-07-22 발견)
     */
    public void updateEvent(CalendarEventDTO dto, EmployeeDTO editor) {
        dto.setDeptId("TEAM".equals(dto.getEventCategory()) ? editor.getDeptId() : null);
        dto.setHoliday("COMPANY".equals(dto.getEventCategory()) && dto.isHoliday());
        calendarMapper.updateEvent(dto);
    }

    /**
     * 일정 삭제
     */
    public void deleteEvent(int eventId) {
        calendarMapper.deleteEvent(eventId);
    }
}