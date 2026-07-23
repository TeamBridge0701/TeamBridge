package com.groupware.controller;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

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

	// 메인 대시보드 날씨 위젯(fragments/weather.html)용 - application.properties의
	// weather.api.key 값을 자동으로 채워 넣음(DB 비밀번호와 같은 취급: 실제 키는 이
	// 코드가 아니라 그 설정 파일에만 있고, 커밋 시 값이 채워진 채로 올라가지 않게 주의)
	@Value("${weather.api.key:}")
	private String weatherApiKey;

	@Value("${weather.api.city:Seoul}")
	private String weatherCity;

	// 타임아웃 없는 기본 RestTemplate 대신, "몇 초 안에 응답 없으면 포기"하는 제한을 걸어둔
	// RestTemplate을 직접 만들어서 씀 - OpenWeatherMap이 응답을 안 줘도 이 요청을 처리하던
	// 서버 스레드가 무한정 붙잡혀 있지 않게 하기 위함(2026-07-22)
	private final RestTemplate restTemplate = createWeatherRestTemplate();

	private static RestTemplate createWeatherRestTemplate() {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(3)); // OpenWeatherMap 서버에 "연결"조차 3초 안에 안 되면 포기
		factory.setReadTimeout(Duration.ofSeconds(3));    // 연결은 됐는데 "응답"이 3초 안에 안 오면 포기
		return new RestTemplate(factory);
	}

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
        model.addAttribute("birthdayEmployees", dashboardData.get("birthdayEmployees"));

        // 기존에 이동하던 메인 페이지 뷰 이름 반환
        return "main";
    }

    // 날씨 위젯(fragments/weather.html)이 부르는 API. 예전엔 브라우저 JS가 OpenWeatherMap을
    // 직접 호출하면서 URL에 API 키를 그대로 박아 넣어 페이지 소스에 노출됐는데, 서버가 대신
    // 호출해서 그 응답을 그대로 돌려주는 것으로 바꿈 - 키는 서버→OpenWeatherMap 요청에만 쓰이고
    // 응답 JSON 자체엔 키가 안 들어있어서 그대로 전달해도 안전함(2026-07-22).
    @ResponseBody
    @GetMapping("/weather")
    public ResponseEntity<String> getWeather() {
        // 키를 아직 안 채운 팀원은 위젯만 "연동 실패"로 보이고 나머지 화면은 정상 동작해야 함
        if (weatherApiKey == null || weatherApiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("{\"message\":\"날씨 API 키가 설정되지 않았습니다.\"}");
        }

        String url = "https://api.openweathermap.org/data/2.5/weather?q=" + weatherCity
                + "&appid=" + weatherApiKey + "&units=metric&lang=kr";
        try {
            String body = restTemplate.getForObject(url, String.class);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
        } catch (RestClientException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("{\"message\":\"날씨 정보를 가져오지 못했습니다.\"}");
        }
    }
}
