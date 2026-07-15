package com.groupware.controller;

import com.groupware.dto.AttendanceDTO;
import com.groupware.service.AttendanceService;
import com.groupware.security.CustomUserDetails;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {

    private final AttendanceService attendanceService;

    public AttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    // 1. 상태 및 대시보드 정보 조회 API
    @GetMapping("/status")
    public Map<String, Object> getStatus(@AuthenticationPrincipal CustomUserDetails user) {
        return getAttendanceData(user.getEmployeeDTO().getEmployeeId());
    }

    // 2. 출근 처리 API
    @PostMapping("/checkIn")
    public Map<String, Object> checkIn(@AuthenticationPrincipal CustomUserDetails user) {
        attendanceService.checkIn(user.getEmployeeDTO().getEmployeeId());
        return getAttendanceData(user.getEmployeeDTO().getEmployeeId());
    }

    // 3. 퇴근 처리 API
    @PostMapping("/checkOut")
    public Map<String, Object> checkOut(@AuthenticationPrincipal CustomUserDetails user) {
        attendanceService.checkOut(user.getEmployeeDTO().getEmployeeId());
        return getAttendanceData(user.getEmployeeDTO().getEmployeeId());
    }

    // 공통 응답 메서드 (상태 + 대시보드 정보 통합)
    private Map<String, Object> getAttendanceData(int employeeId) {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        AttendanceDTO dto = attendanceService.getTodayAttendance(employeeId, today);
        
        Map<String, Object> response = new HashMap<>();
        
        // 상태값 정의 -DTO 자체가 없으면(null) 참: NONE (오늘 출근 안 함) - 있으면 checkouttime이 null이면
        // (dto.getCheckOutTime() == null): 출근 기록은 있는데 퇴근 시간이 없니? -> working상태(일중)
        // (dto.getCheckOutTime() != null : 그 외 나머지: 출근도 했고 퇴근 시간도 들어있니? 참: DONE (오늘 업무 종료)
        String status = (dto == null) ? "NONE" : (dto.getCheckOutTime() == null ? "WORKING" : "DONE");
        
        response.put("success", true);
        response.put("nextStatus", status);
        response.put("attendanceStatus", (dto != null) ? dto.getAttendanceStatus() : "미출근");
        response.put("checkInTime", (dto != null && dto.getCheckInTime() != null) ? dto.getCheckInTime().substring(0, 5) : "-"); //HH:mm으로
        response.put("checkOutTime", (dto != null && dto.getCheckOutTime() != null) ? dto.getCheckOutTime().substring(0, 5) : "-"); //HH:mm으로
        
        return response;
    }
}