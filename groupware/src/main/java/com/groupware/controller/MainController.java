package com.groupware.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;

import com.groupware.dto.AttendanceDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.security.CustomUserDetails;
import com.groupware.service.AttendanceService;
import com.groupware.service.DashboardService;

@Controller
public class MainController {

	@Autowired
    private AttendanceService attendanceService;

	@Autowired
	private DashboardService dashboardService;

    // employee: GlobalModelAdvice가 모든 화면 요청마다 미리 만들어주는 로그인 사용자 정보
    // (Notice/Calendar 컨트롤러 등이 쓰는 것과 같은 파라미터). 오늘 일정 위젯이 캘린더 조회를
    // 재사용하는데, 거기서 부서(deptId)까지 필요해서 employeeId 하나만으로는 부족해졌음
    @GetMapping("/main")
    public String main(@AuthenticationPrincipal CustomUserDetails userDetails,
            @ModelAttribute("employee") EmployeeDTO employee, Model model) {
        // 로그인한 사용자의 사원 ID 가져오기 (userDetails 구조에 맞게 커스텀하세요)
        int employeeId = userDetails.getEmployeeDTO().getEmployeeId();

        // 2. 오늘 날짜를 "YYYY-MM-DD" 포맷의 문자열로 구하기
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

        // 3. 서비스 호출하여 오늘 근태 기록 조회
        AttendanceDTO attendance = attendanceService.getTodayAttendance(employeeId, today);
        // "상태" 표시는 그날 지각/정상/연차(attendance.attendanceStatus)가 아니라 "지금 출근했는지
        // 여부"를 보여줘야 함 - AttendanceService.getCommuteStatusLabel()로 통일(2026-07-21 확인)
        String commuteStatusLabel = attendanceService.getCommuteStatusLabel(attendance);

        // 4. 대시보드 위젯 데이터 조회 (공지 3건, 결재 현황, 오늘 일정, 미니 캘린더, 월간 근태 요약)
        Map<String, Object> dashboardData = dashboardService.getMainDashboardData(employee);

        // 5. 타임리프 화면으로 데이터 배달! (이게 없으면 html에서 데이터를 못 씁니다)
        model.addAttribute("attendance", attendance);
        model.addAttribute("commuteStatusLabel", commuteStatusLabel);
        model.addAttribute("notices", dashboardData.get("notices"));
        model.addAttribute("waitCount", dashboardData.get("waitCount"));
        model.addAttribute("progressCount", dashboardData.get("progressCount"));
        model.addAttribute("approvals", dashboardData.get("approvals"));
        model.addAttribute("todayEvents", dashboardData.get("todayEvents"));
        model.addAttribute("miniCalendarDays", dashboardData.get("miniCalendarDays"));
        model.addAttribute("currentYear", dashboardData.get("currentYear"));
        model.addAttribute("currentMonth", dashboardData.get("currentMonth"));
        model.addAttribute("presentDays", dashboardData.get("presentDays"));
        model.addAttribute("lateCount", dashboardData.get("lateCount"));
        model.addAttribute("leaveCount", dashboardData.get("leaveCount"));
        model.addAttribute("attendanceRate", dashboardData.get("attendanceRate"));

        // 기존에 이동하던 메인 페이지 뷰 이름 반환
        return "main";
    }
}
