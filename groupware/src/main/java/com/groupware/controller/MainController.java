package com.groupware.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import com.groupware.dto.AttendanceDTO;
import com.groupware.security.CustomUserDetails;
import com.groupware.service.AttendanceService;

@Controller
public class MainController {

	@Autowired
    private AttendanceService attendanceService;

    @GetMapping("/main")
    public String main(@AuthenticationPrincipal CustomUserDetails userDetails, Model model) {
        // 로그인한 사용자의 사원 ID 가져오기 (userDetails 구조에 맞게 커스텀하세요)
        int employeeId = userDetails.getEmployeeDTO().getEmployeeId();
        
        // 2. 오늘 날짜를 "YYYY-MM-DD" 포맷의 문자열로 구하기
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        
        // 3. 서비스 호출하여 오늘 근태 기록 조회
        AttendanceDTO attendance = attendanceService.getTodayAttendance(employeeId, today);
        
        // [디버깅] 서버 콘솔창에 찍히는 데이터 확인용
        System.out.println("====== 대시보드 진입 ======");
        System.out.println("사원 ID: " + employeeId);
        System.out.println("조회 날짜: " + today);
        System.out.println("조회된 근태 데이터: " + attendance);
        System.out.println("=========================");

        // 4. 타임리프 화면으로 데이터 배달! (이게 없으면 html에서 데이터를 못 씁니다)
        model.addAttribute("attendance", attendance);
        
        // 기존에 이동하던 메인 페이지 뷰 이름 반환
        return "main"; 
    }
}
