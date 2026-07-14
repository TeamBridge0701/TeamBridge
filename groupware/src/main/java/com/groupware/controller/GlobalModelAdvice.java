package com.groupware.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

import com.groupware.dto.EmployeeDTO;
import com.groupware.security.CustomUserDetails;
import com.groupware.service.EmployeeService;

import lombok.RequiredArgsConstructor;

@ControllerAdvice
@RequiredArgsConstructor
public class GlobalModelAdvice {

    private final EmployeeService employeeService;

    // 모든 화면 요청마다 자동 실행 - 각 Controller가 매번 employee를
    // Model에 안 담아도 헤더에서 쓸 수 있게 여기서 한 번에 채워줌
    @ModelAttribute("employee")
    public EmployeeDTO employee(@AuthenticationPrincipal CustomUserDetails principal) {
        if (principal == null) {
            return null;
        }
        return employeeService.getMyPageInfo(principal.getEmployeeDTO().getEmployeeId());
    }
}