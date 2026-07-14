package com.groupware.controller;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.groupware.dto.DepartmentDTO;
import com.groupware.mapper.EmployeeMapper;
import com.groupware.security.CustomUserDetails;

import lombok.RequiredArgsConstructor;

//  조직도 화면 렌더링과 직원 상세 모달 API만 담당한다.

@Controller
@RequiredArgsConstructor
public class OrgController {

	private final EmployeeMapper employeeMapper;
	
	
	
//  조직도 첫 화면을 서버에서 렌더링한다.
//  deptId가 없으면 전체 재직자, 있으면 선택한 부서의 재직자만 Thymeleaf Model에 담는다.
     
    @GetMapping({ "/org"})
    // 브라우저가 아래 주소로 GET 요청을 보내면 이 메서드가 실행된다.
    public String org(
    		@RequestParam(required = false) Integer deptId,
    		// URL에 있는 deptId 파라미터를 받는 부분이다. 
    		// required = false는 이 값이 없어도 된다는 뜻이야.
    		// Integer을 사용하는 이유 - int는 null을 가질 수 없지만, Integer는 null을 가질 수 있다.
    		
            @AuthenticationPrincipal CustomUserDetails user, 
            // Spring Security가 로그인한 사용자를 CustomUserDetails 객체로 관리하고, 그 객체를 user 변수에 넣어 준다.
            // 이 값을 사용해 현재 로그인 사용자의 직원 번호를 가져온다.
            
            Model model) // Thymeleaf 화면에 전달할 데이터를 담는 객체.
    	{
        List<DepartmentDTO> departments = employeeMapper.findDepartments();

        model.addAttribute("departments", departments);
        // 방금 DB에서 가져온 부서 목록을 Thymeleaf에 전달한다.
        model.addAttribute("employees", employeeMapper.findActiveEmployeesByDepartment(deptId));
        // 전체보기라면 null
        model.addAttribute("selectedDeptId", deptId);
        model.addAttribute("selectedDeptName", departments.stream()
        		// stream()은 List, Set 같은 컬렉션이나 배열 데이터를 
        		// 함수형 스타일로 간편하고 직관적으로 처리하기 위한 API이다.
                .filter(department -> deptId != null && department.getDeptId() == deptId)
                // 조건에 맞는 부서만 남김.
                // 부서 목록 안의 부서 ID가 현재 선택된 deptId와 같은지 확인한.
                //ex) deptId가 2라면 부서 목록 중에서 deptId == 2인 부서만 남기는 것이다.
                
                .map(DepartmentDTO::getDeptName)
                // 그 부서 객체 전체가 아니라 부서 이름만 꺼냄.
                
                .findFirst()
                // 조건에 맞는 부서 하나만 가져옴. 
                
                // 자바가 기본적으로 제공하는 기본 API.
                
                .orElse(null));
        		// 맞는 부서가 없으면 null을 집어넣는다.
        model.addAttribute("currentEmployeeId", user.getEmployeeDTO().getEmployeeId());

        return "org/org";
    }

}
