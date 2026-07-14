package com.groupware.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.groupware.security.CustomUserDetails;
import com.groupware.service.EmployeeService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class MyPageController {

	private final EmployeeService employeeService;

	
	private final EmployeeService employeeService;
	
	// @AuthenticationPrincipal: 로그인 시 세션에 저장해둔 CustomUserDetails를
	// 직접 안 꺼내고 파라미터로 바로 받는 문법. principal = 지금 로그인한 사용자
	@GetMapping("/mypage")
	public String mypage(@AuthenticationPrincipal CustomUserDetails principal, Model model) {
		int employeeId = principal.getEmployeeDTO().getEmployeeId();
		model.addAttribute("employee", employeeService.getMyPageInfo(employeeId));
		return "mypage/mypage";
	}

	// @ResponseBody: 화면 이동 없이 결과 문자열만 응답 (mypage()처럼 뷰 이름 반환 아님)
	// @RequestParam에 이름을 직접 명시 - 컴파일 옵션(-parameters)이 없으면
	// 파라미터 이름을 리플렉션으로 못 읽어와서 IllegalArgumentException이 남
	@PostMapping("/mypage/password")
	@ResponseBody
	public ResponseEntity<String> changePassword(@AuthenticationPrincipal CustomUserDetails principal,
			@RequestParam("currentPassword") String currentPassword,
			@RequestParam("newPassword") String newPassword) {
		boolean success = employeeService.changePassword(principal.getEmployeeDTO().getEmployeeId(), currentPassword,
				newPassword);

		return success ? ResponseEntity.ok("비밀번호가 변경되었습니다.")
				: ResponseEntity.badRequest().body("현재 비밀번호가 일치하지 않습니다.");
	}

	@PostMapping("/mypage/update")
	@ResponseBody
	public ResponseEntity<String> updateContact(@AuthenticationPrincipal CustomUserDetails principal,
			@RequestParam("employeePhone") String employeePhone,
			@RequestParam("employeeEmail") String employeeEmail) {
		employeeService.updateContact(principal.getEmployeeDTO().getEmployeeId(), employeePhone, employeeEmail);
		return ResponseEntity.ok("정보가 저장되었습니다.");
	}
}
